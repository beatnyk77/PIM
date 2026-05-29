import React from 'react';
import { Platform, View, Text, ScrollView } from 'react-native';
import "./global.css";
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PIM ErrorBoundary] Caught render error:', error);
    console.error('[PIM ErrorBoundary] Component stack:', info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#1a0000', padding: 20, justifyContent: 'center' }}>
          <ScrollView>
            <Text style={{ color: '#ff4444', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>
              🛑 PIM Startup Error
            </Text>
            <Text style={{ color: '#ff8888', fontSize: 13, marginBottom: 8 }}>
              {this.state.error.message}
            </Text>
            <Text style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>
              {this.state.error.stack}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  if (Platform.OS === 'web') {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#0B0F19', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{
            maxWidth: 480,
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderRadius: 24,
            padding: 32,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.1)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.5,
            shadowRadius: 20,
          }}>
            <Text style={{ fontSize: 32, textAlign: 'center', marginBottom: 24 }}>🛡️</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 }}>
              Native Enclave Required
            </Text>
            <Text style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
              PIM is a sovereign, offline-first client designed for high-security mobile hardware. It leverages hardware-backed secure enclaves (Keychain/Keystore) and local SQLCipher database encryption which are physically unavailable in a standard desktop web browser.
            </Text>
            
            <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 16, padding: 16, marginBottom: 16 }}>
              <Text style={{ color: '#3B82F6', fontWeight: 'bold', fontSize: 13, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                👉 How to Run PIM:
              </Text>
              <Text style={{ color: '#E5E7EB', fontSize: 13, marginBottom: 6 }}>
                • Press <Text style={{ fontWeight: 'bold', color: '#10B981' }}>i</Text> in terminal for iOS Simulator
              </Text>
              <Text style={{ color: '#E5E7EB', fontSize: 13, marginBottom: 6 }}>
                • Press <Text style={{ fontWeight: 'bold', color: '#10B981' }}>a</Text> in terminal for Android Emulator
              </Text>
              <Text style={{ color: '#E5E7EB', fontSize: 13 }}>
                • Scan QR code using <Text style={{ fontWeight: 'bold', color: '#8B5CF6' }}>Expo Go</Text> on your physical phone
              </Text>
            </View>
            
            <Text style={{ color: '#6B7280', fontSize: 11, textAlign: 'center' }}>
              PIM Messenger • Version 0.9.0-beta.2
            </Text>
          </View>
        </View>
        <StatusBar style="light" />
      </SafeAreaProvider>
    );
  }

  // Native execution: dynamically import navigation to prevent web-load module crashes
  const AppNavigator = require('./navigation').default;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AppNavigator />
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
