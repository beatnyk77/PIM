import React, { useState, useEffect } from 'react';
import { View, SafeAreaView, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity, Text } from 'react-native';
import ChatThread from '../components/ChatThread';
import { useStore, ChatMessage } from '../services/storage/StateManager';

export default function ChatScreen() {
  const { messages, addMessage, setMessages } = useStore();
  const [inputText, setInputText] = useState('');

  // Initial dummy load if empty (just for testing purposes)
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: '1',
          content: 'Hello! This is a test message from StateManager.',
          senderId: 'other',
          timestamp: new Date(Date.now() - 60000),
          isMe: false,
        },
      ]);
    }
  }, []);

  const handleSend = () => {
    if (!inputText.trim()) return;
    
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      content: inputText,
      senderId: 'me',
      timestamp: new Date(),
      isMe: true,
    };

    addMessage(newMessage);
    setInputText('');
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1">
        <ChatThread messages={messages} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        className="border-t border-gray-200 p-4 flex-row items-center"
      >
        <TextInput
          className="flex-1 bg-gray-100 rounded-full px-4 py-2 mr-2"
          placeholder="Type a message..."
          value={inputText}
          onChangeText={setInputText}
        />
        <TouchableOpacity onPress={handleSend}>
          <Text className="text-blue-500 font-bold">Send</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
