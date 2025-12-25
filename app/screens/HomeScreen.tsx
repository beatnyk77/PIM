import { View, Text } from 'react-native';
import { useStore } from '../services/storage/StateManager';
import { useEffect, useState } from 'react';
import { testDbConnection } from '../services/storage/LocalDb';
import { IdentityService } from '../services/auth/IdentityService';

export default function HomeScreen() {
  const { activeChat, setActiveChat } = useStore();
  const [dbStatus, setDbStatus] = useState<string>('Connecting...');
  const [identityStatus, setIdentityStatus] = useState<string>('Pending...');

  useEffect(() => {
    console.log('Current Active Chat:', activeChat);
    // Test update
    setActiveChat('test-chat-id');

    // Test DB
    testDbConnection().then(success => {
      setDbStatus(success ? 'Connected' : 'Failed');
    });

    // Test Identity Generation
    IdentityService.generateIdentity().then(keys => {
      if (keys) {
        setIdentityStatus(`Generated (ID: ${keys.registrationId})`);
        console.log('Keys generated:', keys);
      } else {
        setIdentityStatus('Failed');
      }
    });
  }, []);

  useEffect(() => {
    if (activeChat === 'test-chat-id') {
      console.log('State updated successfully:', activeChat);
    }
  }, [activeChat]);

  return (
    <View className="flex-1 bg-background items-center justify-center">
      <Text className="text-primary text-xl font-bold">Home Screen</Text>
      <Text className="text-secondary mt-2">Navigation Works!</Text>
      <Text className="text-secondary mt-2">Active Chat: {activeChat}</Text>
      <Text className="text-accent mt-2">DB Status: {dbStatus}</Text>
      <Text className="text-accent mt-2">Identity: {identityStatus}</Text>
    </View>
  );
}
