import { View, Text, Button } from 'react-native';
import { useStore } from '../services/storage/StateManager';
import { useEffect, useState } from 'react';
import { testDbConnection } from '../services/storage/LocalDb';
import { IdentityService } from '../services/auth/IdentityService';

export default function HomeScreen() {
  const { activeChat, setActiveChat } = useStore();
  const [dbStatus, setDbStatus] = useState<string>('Connecting...');
  const [identityStatus, setIdentityStatus] = useState<string>('Checking...');

  useEffect(() => {
    console.log('Current Active Chat:', activeChat);
    setActiveChat('test-chat-id');

    // Test DB
    testDbConnection().then(success => {
      setDbStatus(success ? 'Connected' : 'Failed');
    });

    checkIdentity();
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
      
      <View className="mt-4">
        <Button title="Reset Identity" onPress={resetIdentity} />
      </View>
    </View>
  );
}
