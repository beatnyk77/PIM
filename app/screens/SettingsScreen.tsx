import React from 'react';
import { View, Text, Switch, SafeAreaView, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useStore } from '../services/storage/StateManager';
import { useNavigation } from '@react-navigation/native';
import { IdentityService } from '../services/auth/IdentityService';

export default function SettingsScreen() {
  const { settings, updateSettings } = useStore();
  const navigation = useNavigation();

  const toggleSwitch = (key: keyof typeof settings) => {
    updateSettings({ [key]: !settings[key] });
  };

  React.useEffect(() => {
    let subscription: any;
    if (settings.panicGestureEnabled) {
      console.log('SettingsScreen: Activating accelerometer face-down sensor monitoring...');
      try {
        const { Accelerometer } = require('expo-sensors');
        Accelerometer.setUpdateInterval(500);
        subscription = Accelerometer.addListener((data: any) => {
          const { z } = data;
          // z ~ 1 when phone is flat face down.
          if (z > 0.85) {
            console.warn('[Sensor Alert] Face-down accelerometer gesture detected! Triggering immediate Panic zeroization.');
            if (settings.practiceModeEnabled) {
              Alert.alert(
                "🧪 Practice Mode Sensor Alert",
                "Practice Alert: Face-down gesture triggered successfully! Real data remains safe.",
                [{ text: "OK" }]
              );
              return;
            }
            IdentityService.executePanicZeroization().then(() => {
              const { BackHandler } = require('react-native');
              BackHandler.exitApp();
            });
          }
        });
      } catch (e) {
        console.log('SettingsScreen: Native Accelerometer sensors unavailable in current environment. Using software gesture simulation listener.');
        const { EventBus } = require('../services/EventBus');
        const listener = async () => {
          console.warn('[Mock Sensor] Face-down simulated gesture detected! Wiping keys...');
          if (settings.practiceModeEnabled) {
            console.log('Practice Alert: Simulated face-down zeroization sweep. Real data preserved.');
            Alert.alert(
              "🧪 Practice Mode Simulated Gesture",
              "Practice Alert: Face-down simulated sensor triggered successfully! Real data remains safe.",
              [{ text: "OK" }]
            );
            return;
          }
          await IdentityService.executePanicZeroization();
        };
        EventBus.on('sensor.face-down-detected', listener);
        return () => {
          EventBus.off('sensor.face-down-detected', listener);
        };
      }
    }
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [settings.panicGestureEnabled, settings.practiceModeEnabled]);

  const handlePanicPurge = () => {
    if (settings.practiceModeEnabled) {
      Alert.alert(
        "🧪 Practice Mode Triggered",
        "Practice Alert: Zeroization engine triggered successfully! In production, this physically overwrites your database files and permanently purges E2EE keys. Real data preserved.",
        [{ text: "OK" }]
      );
      return;
    }

    Alert.alert(
      "⚠️ ACTIVATE PANIC PURGE?",
      "This will physically overwrite your local database files and permanently delete E2EE and hybrid PQ identity keys from the secure hardware enclave. This action CANNOT be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "WIPE EVERYTHING", 
          style: "destructive",
          onPress: async () => {
            console.warn('[UI Panic] Manual Panic button pressed! Zeroizing database...');
            const success = await IdentityService.executePanicZeroization();
            if (success) {
              Alert.alert("Purge Complete", "All local data has been securely deleted. The app will now exit.", [
                { text: "OK", onPress: () => {
                  try {
                    const { BackHandler } = require('react-native');
                    BackHandler.exitApp();
                  } catch (e) {
                    console.log('App successfully zeroized.');
                  }
                }}
              ]);
            } else {
              Alert.alert("Error", "Failed to zeroize all database records safely.");
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="p-4 border-b border-gray-200 flex-row items-center">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-4">
            <Text className="text-blue-500 text-lg">Back</Text>
        </TouchableOpacity>
        <Text className="text-xl font-bold">Settings</Text>
      </View>

      <ScrollView className="p-4 flex-1">
        <Text className="text-lg font-bold mb-4 text-gray-800">AI Features</Text>
        
        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">AI Assistant</Text>
            <Text className="text-gray-500 text-sm">Enable AI reply suggestions and analysis</Text>
          </View>
          <Switch
            value={settings.aiEnabled}
            onValueChange={() => toggleSwitch('aiEnabled')}
          />
        </View>

        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">Task Detection</Text>
            <Text className="text-gray-500 text-sm">Automatically detect and extract tasks from messages</Text>
          </View>
          <Switch
            value={settings.taskDetectionEnabled}
            onValueChange={() => toggleSwitch('taskDetectionEnabled')}
            disabled={!settings.aiEnabled}
          />
        </View>

        <Text className="text-lg font-bold mb-4 mt-4 text-gray-800">Device Optimization</Text>
        
        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">Lite Mode (Performance/Battery Saver)</Text>
            <Text className="text-gray-500 text-sm">Disables heavy local AI and uses smaller cryptographic padding buckets to save RAM and battery on older devices.</Text>
          </View>
          <Switch
            value={settings.liteModeEnabled}
            onValueChange={() => toggleSwitch('liteModeEnabled')}
          />
        </View>

        <Text className="text-lg font-bold mb-4 mt-4 text-gray-800">Privacy</Text>

        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">Read Receipts</Text>
            <Text className="text-gray-500 text-sm">Send and receive read receipts</Text>
          </View>
          <Switch
            value={settings.readReceiptsEnabled}
            onValueChange={() => toggleSwitch('readReceiptsEnabled')}
          />
        </View>

        <Text className="text-lg font-bold mb-4 mt-4 text-gray-800">Messaging Controls</Text>

        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">Delayed Send (5s)</Text>
            <Text className="text-gray-500 text-sm">Gives you a moment to cancel sent messages</Text>
          </View>
          <Switch
            value={settings.delayedSendEnabled}
            onValueChange={() => toggleSwitch('delayedSendEnabled')}
          />
        </View>

        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">Default Self-Destruct</Text>
            <Text className="text-gray-500 text-sm">Auto-delete messages after a set time</Text>
          </View>
          <View className="flex-row items-center">
              <TouchableOpacity 
                onPress={() => updateSettings({ defaultSelfDestructTime: 0 })}
                className={`px-2 py-1 rounded border mr-2 ${settings.defaultSelfDestructTime === 0 ? 'bg-blue-100 border-blue-500' : 'bg-white border-gray-300'}`}
              >
                  <Text>Off</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => updateSettings({ defaultSelfDestructTime: 30 })}
                className={`px-2 py-1 rounded border ${settings.defaultSelfDestructTime === 30 ? 'bg-blue-100 border-blue-500' : 'bg-white border-gray-300'}`}
              >
                  <Text>30s</Text>
              </TouchableOpacity>
          </View>
        </View>

        <Text className="text-lg font-bold mb-4 mt-4 text-gray-800">Duress & Physical Defenses</Text>

        {/* HIGH-VISIBILTY WARNING DRAWER */}
        <View className="bg-red-50 p-4 rounded-xl mb-6 border border-red-200">
          <Text className="text-red-800 font-bold mb-1 text-sm">⚠️ CRITICAL PRIVACY ADVISORY</Text>
          <Text className="text-red-700 text-xs leading-relaxed">
            Duress features are destructive by design. Triggering a Panic Purge physically overwrites database files and permanently wipes E2EE key materials from the hardware enclave. This data is absolutely unrecoverable.
          </Text>
        </View>

        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">Duress Practice Mode</Text>
            <Text className="text-gray-500 text-sm">Test and practice duress passphrases or gestures safely with benign simulated alerts (recommended for first-time setup)</Text>
          </View>
          <Switch
            value={settings.practiceModeEnabled}
            onValueChange={() => toggleSwitch('practiceModeEnabled')}
          />
        </View>

        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">Duress Decoy Vault</Text>
            <Text className="text-gray-500 text-sm">Derives a secondary decoy vault populated with benign chats when unlocking with a decoy password</Text>
          </View>
          <Switch
            value={settings.decoyVaultEnabled}
            onValueChange={() => toggleSwitch('decoyVaultEnabled')}
          />
        </View>

        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">Face-down Panic Wiping</Text>
            <Text className="text-gray-500 text-sm">Instantly zeroizes identity keys and scrubs local database storage when device is flipped face-down</Text>
          </View>
          <Switch
            value={settings.panicGestureEnabled}
            onValueChange={() => toggleSwitch('panicGestureEnabled')}
          />
        </View>

        <Text className="text-lg font-bold mb-4 mt-4 text-gray-800">Multi-Device Synchronizations</Text>
        
        <View className="bg-gray-50 p-4 rounded-xl mb-6 border border-gray-200">
            <Text className="text-base font-semibold mb-2">Linked Devices</Text>
            <Text className="text-gray-500 text-sm mb-4">Manage trusted secondary devices. Revoking a device will bump the revocation epoch and cryptographically block it from accessing new incoming E2EE messages.</Text>
            
            <TouchableOpacity className="bg-blue-600 py-3 rounded-lg items-center">
                <Text className="text-white font-bold">Manage Linked Devices</Text>
            </TouchableOpacity>
        </View>

        <View className="bg-gray-50 p-4 rounded-xl mb-6 border border-gray-200">
          <Text className="text-gray-800 font-bold mb-1 text-sm">🔄 P2P KEY EXCHANGE WIZARD</Text>
          <Text className="text-gray-600 text-xs leading-relaxed mb-4">
            Transfer Bob's E2EE & post-quantum identity keys securely to a secondary device. Both devices maintain independent ratchets to protect forward secrecy.
          </Text>
          
          <View className="flex-row justify-between">
            <TouchableOpacity 
              onPress={async () => {
                const payload = await IdentityService.generateD2DTransferPayload('123456');
                if (payload) {
                  Alert.alert(
                    "🔑 QR Payload Generated (PIN: 123456)",
                    `Share this secure, encrypted transient package with your secondary device:\n\n${payload.substring(0, 150)}...`,
                    [{ text: "OK" }]
                  );
                } else {
                  Alert.alert("Error", "Failed to generate key exchange payload.");
                }
              }}
              className="bg-blue-500 flex-1 mr-2 py-2 rounded-lg items-center"
            >
              <Text className="text-white font-semibold text-xs">Export Key Payload</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={async () => {
                // Simulate secondary device scanning/importing Bob's payload
                const mockPin = '123456';
                const mockPayload = await IdentityService.generateD2DTransferPayload(mockPin);
                if (mockPayload) {
                  const decoded = await IdentityService.decodeD2DPayload(mockPayload, mockPin);
                  if (decoded) {
                    const success = await IdentityService.confirmD2DImport(decoded.rawPayload);
                    if (success) {
                      Alert.alert("Success", "E2EE and hybrid post-quantum identity keys successfully imported onto this secondary device! Isolated ratchets instantiated.");
                    } else {
                      Alert.alert("Error", "Key import confirmation failed.");
                    }
                  } else {
                    Alert.alert("Error", "Key decryption failed.");
                  }
                }
              }}
              className="bg-gray-800 flex-1 ml-2 py-2 rounded-lg items-center"
            >
              <Text className="text-white font-semibold text-xs">Simulate Import</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity 
          onPress={handlePanicPurge}
          className="bg-red-500 py-3 rounded-lg items-center mb-10"
        >
            <Text className="text-white font-bold text-base">⚠️ ACTIVATE PANIC PURGE</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
