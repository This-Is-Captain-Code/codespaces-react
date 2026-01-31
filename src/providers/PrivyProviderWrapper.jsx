import { PrivyProvider } from '@privy-io/react-auth';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

export function PrivyProviderWrapper({ children }) {
  if (!PRIVY_APP_ID) {
    return children;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'twitter', 'google'],
        appearance: {
          theme: 'light',
          accentColor: '#6366f1',
          logo: 'https://openclaw.ai/logo.png',
        },
        embeddedWallets: {
          createOnLogin: 'off',
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
