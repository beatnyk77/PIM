import React, { useState, useEffect } from 'react';
import { View, SafeAreaView, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import ChatThread from '../components/ChatThread';
import { useStore, ChatMessage } from '../services/storage/StateManager';
import { AiAdvisor } from '../services/ai/AiAdvisor';
import { ToneDetector, Tone } from '../services/ai/ToneDetector';
import { MessageRelay } from '../services/messaging/MessageRelay';
import { EventBus } from '../services/EventBus';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as ScreenCapture from 'expo-screen-capture';
import { useCommitmentStore } from '../stores/useCommitmentStore';

export default function ChatScreen() {
  const { messages, addMessage, setMessages, updateMessageStatus, activeChat, activeGroup, setActiveGroup, setActiveChat, settings, deleteMessage } = useStore();
  const commitmentStore = useCommitmentStore();
  const [inputText, setInputText] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [detectedTone, setDetectedTone] = useState<Tone | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  
  // Delayed Send State
  const [pendingMessage, setPendingMessage] = useState<{ content: string, timer: NodeJS.Timeout, remaining: number } | null>(null);
  const [delayCount, setDelayCount] = useState(0);

  // Self Destruct State
  const [isEphemeral, setIsEphemeral] = useState(false);

  useEffect(() => {
    // Check for expired messages
    const interval = setInterval(() => {
        const now = new Date();
        messages.forEach(msg => {
            if (msg.expiresAt && new Date(msg.expiresAt) < now) {
                console.log('Message expired:', msg.id);
                deleteMessage(msg.id);
            }
        });
    }, 1000);

    return () => clearInterval(interval);
  }, [messages, deleteMessage]);

  useEffect(() => {
    // Enable screenshot detection
    const subscription = ScreenCapture.addScreenshotListener(() => {
        const systemMsg: ChatMessage = {
            id: Date.now().toString(),
            content: '⚠️ Screenshot taken!',
            senderId: 'system',
            timestamp: new Date(),
            isMe: false,
            status: 'read'
        };
        addMessage(systemMsg);
    });

    return () => {
        subscription.remove();
    };
  }, []);

  useEffect(() => {
    AiAdvisor.initialize();

    // 1. Load initial messages (mock for now)
    if (messages.length === 0) {
      // ...
    }

    // 2. Listen for events
    const onMessage = (data: any) => {
        // Handle basic message
    };

    const onSecureMessage = (data: any) => {
      const newMessage: ChatMessage = {
          id: data.messageId || Date.now().toString(),
          content: data.content,
          senderId: data.from,
          timestamp: new Date(data.timestamp),
          isMe: false,
          status: 'read',
      };
      addMessage(newMessage);
    };

    const onGroupMessage = (data: any) => {
        if (activeGroup && data.groupId === activeGroup) {
            const newMessage: ChatMessage = {
                id: Date.now().toString(),
                content: data.content,
                senderId: data.from,
                timestamp: new Date(data.timestamp),
                isMe: false,
                status: 'read',
                groupId: data.groupId,
                type: data.type as any,
                mediaUri: data.mediaUri
            };
            addMessage(newMessage);
        }
    };

    const onReadReceipt = (data: any) => {
      if (data.messageId) {
        updateMessageStatus(data.messageId, 'read');
      }
    };

    const onTaskDetected = (data: { chatId: string, task: string, originalContent: string }) => {
        // Automatically add to commitments if it comes from the active chat
        // or maybe just add it globally.
        console.log('ChatScreen: Auto-adding task:', data.task);
        commitmentStore.addCommitment(data.task, 'Today');
    };

    EventBus.on('message.received', onMessage);
    EventBus.on('message.secure-received', onSecureMessage);
    EventBus.on('message.group-received', onGroupMessage);
    EventBus.on('message.read-receipt', onReadReceipt);
    EventBus.on('ai.task-detected', onTaskDetected);

    return () => {
      EventBus.off('message.received', onMessage);
      EventBus.off('message.secure-received', onSecureMessage);
      EventBus.off('message.group-received', onGroupMessage);
      EventBus.off('message.read-receipt', onReadReceipt);
      EventBus.off('ai.task-detected', onTaskDetected);
    };
  }, [addMessage, updateMessageStatus, activeGroup]);

  // Toggle Group Mode for testing
  const toggleGroupMode = () => {
      if (activeGroup) {
          setActiveChat('user2'); // Switch back to DM
      } else {
          setActiveGroup('test-group'); // Switch to Group
          MessageRelay.joinGroup('test-group');
      }
  };

  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status === 'granted') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const { recording } = await Audio.Recording.createAsync(
           Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        setRecording(recording);
      }
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  }

  async function stopRecording() {
    if (!recording) return;
    
    try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setRecording(null);
        
        if (uri) {
            const newMessage: ChatMessage = {
                 id: Date.now().toString(),
                 content: 'Voice Note',
                 senderId: 'me',
                 timestamp: new Date(),
                 isMe: true,
                 status: 'sent',
                 type: 'audio',
                 mediaUri: uri
            };
            addMessage(newMessage);
            
            // In a real app, upload file then send URL. 
            // For MVP/Relay, we might skip sending the audio blob over socket for now 
            // or implement a file upload service.
            // We'll just log it.
            console.log('Voice note created at', uri);
        }
    } catch (error) {
        console.error('Failed to stop recording', error);
    }
  }

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.5,
    });

    if (!result.canceled && result.assets[0].uri) {
         const newMessage: ChatMessage = {
             id: Date.now().toString(),
             content: 'Image',
             senderId: 'me',
             timestamp: new Date(),
             isMe: true,
             status: 'sent',
             type: 'image',
             mediaUri: result.assets[0].uri
        };
        addMessage(newMessage);
    }
  };

  const executeSend = async (content: string) => {
    const tempId = Date.now().toString();
    
    // Calculate expiration if needed
    let expiresAt: Date | undefined;
    const ttl = isEphemeral ? 30 : settings.defaultSelfDestructTime; // Use toggle or setting
    if (ttl > 0) {
        expiresAt = new Date(Date.now() + ttl * 1000);
    }

    const newMessage: ChatMessage = {
      id: tempId,
      content: content,
      senderId: 'me',
      timestamp: new Date(),
      isMe: true,
      status: 'sent', 
      groupId: activeGroup || undefined,
      expiresAt
    };

    addMessage(newMessage);
    setDetectedTone(null);

    // Send via Relay
    if (activeGroup) {
        MessageRelay.sendGroupMessage(activeGroup, newMessage.content);
    } else if (activeChat) {
      const messageId = await MessageRelay.sendSecureMessage(activeChat, newMessage.content);
      if (messageId) {
        // Update the message ID if needed
      }
    }
    
    // Check for tasks in the message
    try {
        const task = await AiAdvisor.extractTasks(newMessage.content);
        if (task) {
             const { useCommitmentStore } = require('../stores/useCommitmentStore');
             useCommitmentStore.getState().addCommitment(task.title, task.deadline);
        }
    } catch (e) {
        console.log('Task extraction failed', e);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const content = inputText;
    setInputText('');

    if (settings.delayedSendEnabled) {
        setDelayCount(5);
        const timer = setInterval(() => {
            setDelayCount(c => {
                if (c <= 1) {
                    clearInterval(timer);
                    executeSend(content);
                    setPendingMessage(null);
                    return 0;
                }
                return c - 1;
            });
        }, 1000);
        
        setPendingMessage({ content, timer, remaining: 5 });
    } else {
        executeSend(content);
    }
  };

  const cancelDelayedSend = () => {
      if (pendingMessage) {
          clearInterval(pendingMessage.timer);
          setPendingMessage(null);
          setDelayCount(0);
          setInputText(pendingMessage.content); // Restore text
      }
  };

  const sendNow = () => {
      if (pendingMessage) {
          clearInterval(pendingMessage.timer);
          executeSend(pendingMessage.content);
          setPendingMessage(null);
          setDelayCount(0);
      }
  };

  const handleSuggestReply = async () => {
    // Get last received message
    const lastReceived = [...messages].reverse().find(m => !m.isMe);
    if (!lastReceived) return;

    setIsAiLoading(true);
    try {
      // 1. Suggest Reply
      const suggestion = await AiAdvisor.suggestReply(lastReceived.content);
      setInputText(suggestion);

      // 2. Detect Tone (of the last message)
      const tone = await ToneDetector.detectTone(lastReceived.content);
      setDetectedTone(tone);
    } catch (e) {
      console.error('AI Failed', e);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="p-4 border-b border-gray-200 flex-row justify-between items-center">
        <Text className="text-xl font-bold">
            {activeGroup ? `Group: ${activeGroup}` : `Chat with ${activeChat}`}
        </Text>
        <TouchableOpacity onPress={toggleGroupMode}>
            <Text className="text-blue-500">{activeGroup ? 'Exit Group' : 'Join Group'}</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-1">
        <ChatThread messages={messages.filter(m => activeGroup ? m.groupId === activeGroup : !m.groupId)} />
      </View>

      {/* AI Toolbar */}
      {settings.aiEnabled && (
      <View className="px-4 py-2 flex-row justify-between items-center bg-gray-50 border-t border-gray-200">
        <View>
            {detectedTone && (
                <Text className="text-xs text-gray-500">
                    Tone: <Text className="font-bold capitalize">{detectedTone}</Text>
                </Text>
            )}
        </View>
        <TouchableOpacity 
            onPress={handleSuggestReply} 
            disabled={isAiLoading}
            className="bg-purple-100 px-3 py-1 rounded-full"
        >
            {isAiLoading ? (
                <ActivityIndicator size="small" color="#9333ea" />
            ) : (
                <Text className="text-purple-700 text-xs font-semibold">✨ Suggest Reply</Text>
            )}
        </TouchableOpacity>
      </View>
      )}

      {/* Delayed Send Indicator */}
      {pendingMessage && (
          <View className="bg-yellow-100 p-2 flex-row justify-between items-center border-t border-yellow-200">
              <Text className="text-yellow-800 font-bold">Sending in {delayCount}s...</Text>
              <View className="flex-row">
                  <TouchableOpacity onPress={cancelDelayedSend} className="mr-3">
                      <Text className="text-red-500 font-bold">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={sendNow}>
                      <Text className="text-blue-500 font-bold">Send Now</Text>
                  </TouchableOpacity>
              </View>
          </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        className="border-t border-gray-200 p-4 flex-row items-center"
      >
        <TouchableOpacity onPress={pickImage} className="mr-2 p-2">
            <Text className="text-xl">📷</Text>
        </TouchableOpacity>

        <TouchableOpacity 
            onPress={() => setIsEphemeral(!isEphemeral)} 
            className={`mr-2 p-2 rounded ${isEphemeral ? 'bg-orange-100' : ''}`}
        >
            <Text className="text-xl">🔥</Text>
        </TouchableOpacity>

        <TextInput
          className="flex-1 bg-gray-100 rounded-full px-4 py-2 mr-2"
          placeholder={recording ? "Recording..." : "Type a message..."}
          value={inputText}
          onChangeText={setInputText}
          editable={!recording}
        />
        {inputText.length > 0 ? (
          <TouchableOpacity onPress={handleSend} className="bg-blue-500 p-2 rounded-full">
            <Text className="text-white font-bold px-2">Send</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            onPressIn={startRecording} 
            onPressOut={stopRecording}
            className={`p-3 rounded-full ${recording ? 'bg-red-500' : 'bg-gray-200'}`}
          >
            <Text className="text-xl">{recording ? '🛑' : '🎤'}</Text>
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
