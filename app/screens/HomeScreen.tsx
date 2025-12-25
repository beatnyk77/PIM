import { View, Text, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../services/storage/StateManager';
import { useEffect, useState } from 'react';
import { testDbConnection } from '../services/storage/LocalDb';
import { IdentityService } from '../services/auth/IdentityService';
import { MessageRelay, relayEvents } from '../services/messaging/MessageRelay';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { activeChat, setActiveChat } = useStore();
  const [dbStatus, setDbStatus] = useState<string>('Connecting...');
  const [identityStatus, setIdentityStatus] = useState<string>('Checking...');
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected');

  useEffect(() => {
    console.log('Current Active Chat:', activeChat);
    setActiveChat('test-chat-id');

    // Test DB
    testDbConnection().then(success => {
      setDbStatus(success ? 'Connected' : 'Failed');
    });

    checkIdentity();

    // Test MessageRelay
    const setupRelay = async () => {
       const keys = await IdentityService.loadKeys();
       if (keys) {
         MessageRelay.connect(keys.registrationId.toString());
       }
    };
    setupRelay();

    // Listen for relay events
    relayEvents.on('connected', () => setConnectionStatus('Connected'));
    relayEvents.on('disconnected', () => setConnectionStatus('Disconnected'));

    return () => {
      relayEvents.off('connected');
      relayEvents.off('disconnected');
    }
  }, []);

  const checkIdentity = async () => {
    const existingKeys = await IdentityService.loadKeys();
    if (existingKeys) {
      setIdentityStatus(`Loaded (ID: ${existingKeys.registrationId})`);
    } else {
      setIdentityStatus('No keys found. Generating...');
      const newKeys = await IdentityService.generateIdentity();
      if (newKeys) {
        setIdentityStatus(`Generated (ID: ${newKeys.registrationId})`);
      } else {
        setIdentityStatus('Failed to generate');
      }
    }
  };

  const resetIdentity = async () => {
    await IdentityService.clearKeys();
    setIdentityStatus('Keys Cleared');
    setTimeout(checkIdentity, 1000);
  };

  return (
    <View className="flex-1 bg-background items-center justify-center">
      <Text className="text-primary text-xl font-bold">Home Screen</Text>
      <Text className="text-secondary mt-2">Navigation Works!</Text>
      <Text className="text-secondary mt-2">Active Chat: {activeChat}</Text>
      <Text className="text-accent mt-2">DB Status: {dbStatus}</Text>
      <Text className="text-accent mt-2">Identity: {identityStatus}</Text>
      <Text className="text-accent mt-2">Relay: {connectionStatus}</Text>
      
      <View className="mt-4 space-y-2">
        <Button title="View Profile" onPress={() => navigation.navigate('Profile')} />
        <Button title="Open Chat (Test)" onPress={() => navigation.navigate('Chat')} />
        <Button title="Reset Identity" onPress={resetIdentity} color="red" />
      </View>
    </View>
  );
}
