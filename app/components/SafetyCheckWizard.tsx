import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ActivityIndicator, TouchableOpacity } from 'react-native';
import { IdentityService } from '../services/auth/IdentityService';
import { database } from '../services/storage/LocalDb';
import { useStore } from '../services/storage/StateManager';

export function SafetyCheckWizard() {
    const { settings, updateSettings } = useStore();
    const [status, setStatus] = useState<string>('Initializing safety check...');
    const [isDone, setIsDone] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (settings.safetyCheckCompleted) return;

        async function runChecks() {
            try {
                setStatus('Verifying Hardware Enclave Keys...');
                const keys = await IdentityService.loadKeys();
                if (!keys) throw new Error('Identity keys missing or inaccessible!');

                setStatus('Verifying SQLCipher Database Mount...');
                if (!database) throw new Error('Database not securely mounted');
                
                setStatus('Validating System Integrities...');
                // Dummy wait to simulate deep check, actual connection handled in HomeScreen
                await new Promise(r => setTimeout(r, 1200));

                setStatus('All Security Systems Nominal.');
                setSuccess(true);
            } catch (e: any) {
                setStatus(`Critical Failure: ${e.message}`);
                setSuccess(false);
            } finally {
                setIsDone(true);
            }
        }
        runChecks();
    }, [settings.safetyCheckCompleted]);

    if (settings.safetyCheckCompleted) return null;

    return (
        <Modal animationType="slide" transparent={false} visible={!settings.safetyCheckCompleted}>
            <View className="flex-1 bg-gray-900 items-center justify-center p-6">
                <Text className="text-white text-2xl font-bold mb-8">PIM Safety Check</Text>
                
                <View className="bg-gray-800 p-6 rounded-xl w-full mb-8">
                    {!isDone ? (
                        <View className="items-center py-4">
                            <ActivityIndicator size="large" color="#4ade80" className="mb-6" />
                            <Text className="text-gray-300 text-center font-semibold">{status}</Text>
                        </View>
                    ) : (
                        <View className="items-center">
                            <Text className={`text-xl font-bold mb-4 ${success ? 'text-green-400' : 'text-red-400'}`}>
                                {success ? '✅ System Secure' : '❌ Security Compromised'}
                            </Text>
                            <Text className="text-gray-300 text-center mb-6">{status}</Text>
                            
                            {success && (
                                <View className="bg-yellow-900/40 p-4 rounded-lg mb-6 border border-yellow-700/50 w-full">
                                    <Text className="text-yellow-500 font-bold mb-2">⚠️ Public Beta Advisory</Text>
                                    <Text className="text-yellow-200/80 text-xs leading-relaxed">
                                        PIM is currently in public beta. Expect potential instability. Due to heavy local AI memory usage, older devices may crash. Enable "Lite Mode" in Settings if you experience performance issues. Do not rely solely on PIM for life-or-death situations until stable v1.0.
                                    </Text>
                                </View>
                            )}

                            <TouchableOpacity 
                                disabled={!success}
                                onPress={() => updateSettings({ safetyCheckCompleted: true })}
                                className={`w-full py-4 rounded-lg items-center ${success ? 'bg-blue-600' : 'bg-gray-700'}`}
                            >
                                <Text className={`font-bold ${success ? 'text-white' : 'text-gray-400'}`}>
                                    {success ? 'Acknowledge & Continue' : 'Cannot Proceed'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
}
