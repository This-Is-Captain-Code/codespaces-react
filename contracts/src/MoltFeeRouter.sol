// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {SafeCast} from "v4-core/src/libraries/SafeCast.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";

contract MoltFeeRouter is BaseHook {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using SafeCast for uint256;

    enum FeeMode { CONSERVATIVE, BALANCED, AGGRESSIVE }

    struct PoolConfig {
        address agentTreasury;
        address developer;
        address platform;
        address tokenAdmin;
        uint64 createdAt;
        FeeMode feeMode;
        uint16 agentShareBps;
        uint16 devShareBps;
        uint16 platformShareBps;
        uint16 adminShareBps;
        uint16 baseFee;
        bool initialized;
    }

    struct VolumeData {
        uint128 dailyVolume;
        uint64 lastResetTimestamp;
    }

    struct AccruedFees {
        uint256 agentFees;
        uint256 devFees;
        uint256 platformFees;
        uint256 adminFees;
    }

    uint16 public constant MAX_BPS = 10000;
    uint16 public constant MAX_AGENT_SHARE = 5000;
    uint16 public constant MIN_AGENT_SHARE = 200;
    uint16 public constant DEFAULT_BASE_FEE = 100;

    uint16 public constant VOLUME_TIER_LOW_FEE = 100;
    uint16 public constant VOLUME_TIER_MED_FEE = 50;
    uint16 public constant VOLUME_TIER_HIGH_FEE = 30;
    uint128 public constant VOLUME_TIER_MED_THRESHOLD = 10 ether;
    uint128 public constant VOLUME_TIER_HIGH_THRESHOLD = 100 ether;

    uint64 public constant EARLY_PERIOD = 7 days;
    uint64 public constant GROWTH_PERIOD = 30 days;

    address public immutable moltAdmin;

    mapping(PoolId => PoolConfig) public poolConfigs;
    mapping(PoolId => VolumeData) public volumeData;
    mapping(PoolId => mapping(Currency => AccruedFees)) public accruedFees;

    event PoolRegistered(PoolId indexed poolId, address agentTreasury, address developer);
    event FeeModeChanged(PoolId indexed poolId, FeeMode newMode, address changedBy);
    event AgentShareUpdated(PoolId indexed poolId, uint16 newShareBps);
    event FeeRouted(
        PoolId indexed poolId,
        Currency currency,
        uint256 totalFee,
        uint256 agentAmount,
        uint256 devAmount,
        uint256 platformAmount,
        uint256 adminAmount
    );
    event FeesClaimed(PoolId indexed poolId, Currency currency, address recipient, uint256 amount);

    error PoolNotInitialized();
    error NotAuthorized();
    error InvalidShareBps();
    error SharesExceedMax();
    error AlreadyInitialized();

    modifier onlyPoolAgent(PoolId poolId) {
        PoolConfig storage config = poolConfigs[poolId];
        if (!config.initialized) revert PoolNotInitialized();
        if (msg.sender != config.agentTreasury && msg.sender != config.tokenAdmin)
            revert NotAuthorized();
        _;
    }

    modifier onlyMoltAdmin() {
        if (msg.sender != moltAdmin) revert NotAuthorized();
        _;
    }

    constructor(IPoolManager _poolManager, address _moltAdmin) BaseHook(_poolManager) {
        moltAdmin = _moltAdmin;
    }

    function getHookPermissions()
        public
        pure
        override
        returns (Hooks.Permissions memory)
    {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function registerPool(
        PoolKey calldata key,
        address agentTreasury,
        address developer,
        address platform,
        address tokenAdmin
    ) external onlyMoltAdmin {
        PoolId poolId = key.toId();
        if (poolConfigs[poolId].initialized) revert AlreadyInitialized();

        poolConfigs[poolId] = PoolConfig({
            agentTreasury: agentTreasury,
            developer: developer,
            platform: platform,
            tokenAdmin: tokenAdmin,
            createdAt: uint64(block.timestamp),
            feeMode: FeeMode.BALANCED,
            agentShareBps: 833,
            devShareBps: 3333,
            platformShareBps: 4167,
            adminShareBps: 1667,
            baseFee: DEFAULT_BASE_FEE,
            initialized: true
        });

        volumeData[poolId] = VolumeData({
            dailyVolume: 0,
            lastResetTimestamp: uint64(block.timestamp)
        });

        emit PoolRegistered(poolId, agentTreasury, developer);
    }

    function setFeeMode(PoolKey calldata key, FeeMode mode)
        external
        onlyPoolAgent(key.toId())
    {
        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];
        config.feeMode = mode;

        if (mode == FeeMode.CONSERVATIVE) {
            config.agentShareBps = 500;
            config.devShareBps = 3000;
            config.platformShareBps = 4500;
            config.adminShareBps = 2000;
        } else if (mode == FeeMode.BALANCED) {
            config.agentShareBps = 833;
            config.devShareBps = 3333;
            config.platformShareBps = 4167;
            config.adminShareBps = 1667;
        } else {
            config.agentShareBps = 2000;
            config.devShareBps = 3000;
            config.platformShareBps = 3500;
            config.adminShareBps = 1500;
        }

        emit FeeModeChanged(poolId, mode, msg.sender);
    }

    function setAgentShare(PoolKey calldata key, uint16 newShareBps)
        external
        onlyPoolAgent(key.toId())
    {
        if (newShareBps < MIN_AGENT_SHARE || newShareBps > MAX_AGENT_SHARE)
            revert InvalidShareBps();

        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];

        uint16 remaining = MAX_BPS - newShareBps;
        uint16 totalOther = config.devShareBps + config.platformShareBps + config.adminShareBps;

        config.agentShareBps = newShareBps;
        config.devShareBps = uint16((uint256(config.devShareBps) * remaining) / totalOther);
        config.platformShareBps = uint16((uint256(config.platformShareBps) * remaining) / totalOther);
        config.adminShareBps = remaining - config.devShareBps - config.platformShareBps;

        emit AgentShareUpdated(poolId, newShareBps);
    }

    function claimFees(PoolKey calldata key, Currency currency) external {
        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];
        if (!config.initialized) revert PoolNotInitialized();

        AccruedFees storage fees = accruedFees[poolId][currency];
        uint256 amount;

        if (msg.sender == config.agentTreasury) {
            amount = fees.agentFees;
            fees.agentFees = 0;
        } else if (msg.sender == config.developer) {
            amount = fees.devFees;
            fees.devFees = 0;
        } else if (msg.sender == config.platform) {
            amount = fees.platformFees;
            fees.platformFees = 0;
        } else if (msg.sender == config.tokenAdmin) {
            amount = fees.adminFees;
            fees.adminFees = 0;
        } else {
            revert NotAuthorized();
        }

        if (amount > 0) {
            poolManager.unlock(abi.encode(currency, msg.sender, amount));
            emit FeesClaimed(poolId, currency, msg.sender, amount);
        }
    }

    function _afterInitialize(
        address,
        PoolKey calldata,
        uint160,
        int24
    ) internal override returns (bytes4) {
        return BaseHook.afterInitialize.selector;
    }

    function _beforeSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata,
        bytes calldata
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];

        if (!config.initialized) {
            return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        uint24 dynamicFee = _calculateDynamicFee(poolId, config);

        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, dynamicFee | uint24(0x400000));
    }

    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];

        if (!config.initialized) {
            return (BaseHook.afterSwap.selector, 0);
        }

        _updateVolume(poolId, params.amountSpecified);

        int128 amount0 = delta.amount0();
        int128 amount1 = delta.amount1();

        Currency feeCurrency;
        uint256 swapAmount;

        if (amount0 < 0) {
            feeCurrency = key.currency0;
            swapAmount = uint256(uint128(-amount0));
        } else {
            feeCurrency = key.currency1;
            swapAmount = uint256(uint128(-amount1));
        }

        uint256 totalFee = (swapAmount * config.baseFee) / MAX_BPS;

        if (totalFee > 0) {
            (uint256 agentAmt, uint256 devAmt, uint256 platformAmt, uint256 adminAmt) =
                _calculateSplit(config, totalFee, poolId);

            AccruedFees storage fees = accruedFees[poolId][feeCurrency];
            fees.agentFees += agentAmt;
            fees.devFees += devAmt;
            fees.platformFees += platformAmt;
            fees.adminFees += adminAmt;

            emit FeeRouted(
                poolId,
                feeCurrency,
                totalFee,
                agentAmt,
                devAmt,
                platformAmt,
                adminAmt
            );

            return (BaseHook.afterSwap.selector, totalFee.toInt128());
        }

        return (BaseHook.afterSwap.selector, 0);
    }

    function _calculateDynamicFee(PoolId poolId, PoolConfig storage config)
        internal
        view
        returns (uint24)
    {
        VolumeData storage vol = volumeData[poolId];
        uint128 currentVolume = vol.dailyVolume;

        uint16 fee;
        if (currentVolume >= VOLUME_TIER_HIGH_THRESHOLD) {
            fee = VOLUME_TIER_HIGH_FEE;
        } else if (currentVolume >= VOLUME_TIER_MED_THRESHOLD) {
            fee = VOLUME_TIER_MED_FEE;
        } else {
            fee = VOLUME_TIER_LOW_FEE;
        }

        uint64 age = uint64(block.timestamp) - config.createdAt;
        if (age < EARLY_PERIOD) {
            fee = fee + 20;
        } else if (age < GROWTH_PERIOD) {
            fee = fee + 10;
        }

        return uint24(fee);
    }

    function _calculateSplit(
        PoolConfig storage config,
        uint256 totalFee,
        PoolId poolId
    ) internal view returns (uint256 agent, uint256 dev, uint256 platform, uint256 admin) {
        uint64 age = uint64(block.timestamp) - config.createdAt;

        uint16 agentBps = config.agentShareBps;
        uint16 devBps = config.devShareBps;
        uint16 platformBps = config.platformShareBps;
        uint16 adminBps = config.adminShareBps;

        if (age < EARLY_PERIOD) {
            devBps = devBps + 500;
            agentBps = agentBps > 500 ? agentBps - 500 : 0;
        } else if (age > GROWTH_PERIOD) {
            agentBps = agentBps + 300;
            devBps = devBps > 300 ? devBps - 300 : 0;
        }

        uint16 totalBps = agentBps + devBps + platformBps + adminBps;

        agent = (totalFee * agentBps) / totalBps;
        dev = (totalFee * devBps) / totalBps;
        platform = (totalFee * platformBps) / totalBps;
        admin = totalFee - agent - dev - platform;
    }

    function _updateVolume(PoolId poolId, int256 amountSpecified) internal {
        VolumeData storage vol = volumeData[poolId];

        if (block.timestamp - vol.lastResetTimestamp > 1 days) {
            vol.dailyVolume = 0;
            vol.lastResetTimestamp = uint64(block.timestamp);
        }

        uint128 absAmount = amountSpecified > 0
            ? uint128(uint256(amountSpecified))
            : uint128(uint256(-amountSpecified));

        vol.dailyVolume += absAmount;
    }

    function getPoolConfig(PoolKey calldata key)
        external
        view
        returns (PoolConfig memory)
    {
        return poolConfigs[key.toId()];
    }

    function getAccruedFees(PoolKey calldata key, Currency currency)
        external
        view
        returns (AccruedFees memory)
    {
        return accruedFees[key.toId()][currency];
    }

    function getVolumeData(PoolKey calldata key)
        external
        view
        returns (VolumeData memory)
    {
        return volumeData[key.toId()];
    }

    function getCurrentFee(PoolKey calldata key)
        external
        view
        returns (uint24)
    {
        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];
        if (!config.initialized) return 0;
        return _calculateDynamicFee(poolId, config);
    }

    function getCurrentSplit(PoolKey calldata key)
        external
        view
        returns (uint16 agentBps, uint16 devBps, uint16 platformBps, uint16 adminBps)
    {
        PoolId poolId = key.toId();
        PoolConfig storage config = poolConfigs[poolId];
        if (!config.initialized) return (0, 0, 0, 0);

        uint64 age = uint64(block.timestamp) - config.createdAt;
        agentBps = config.agentShareBps;
        devBps = config.devShareBps;
        platformBps = config.platformShareBps;
        adminBps = config.adminShareBps;

        if (age < EARLY_PERIOD) {
            devBps = devBps + 500;
            agentBps = agentBps > 500 ? agentBps - 500 : 0;
        } else if (age > GROWTH_PERIOD) {
            agentBps = agentBps + 300;
            devBps = devBps > 300 ? devBps - 300 : 0;
        }
    }
}
