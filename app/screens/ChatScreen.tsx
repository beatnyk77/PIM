import React, { useState, useEffect } from 'react';
import { View, SafeAreaView, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity, Text } from 'react-native';
import ChatThread, { ChatMessage } from '../components/ChatThread';

export default function ChatScreen() {
  // Dummy data for testing Task 17 (aka Task 16 in tasks.md)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      content: 'Hello! This is a test message.',
      senderId: 'other',
      timestamp: new Date(Date.now() - 60000),
      isMe: false,
    },
    {
      id: '2',
      content: 'Hi there! Looks like the ChatThread component is working.',
      senderId: 'me',
      timestamp: new Date(),
      isMe: true,
    },
  ]);

  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (!inputText.trim()) return;
    
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      content: inputText,
      senderId: 'me',
      timestamp: new Date(),
      isMe: true,
    };

    setMessages([...messages, newMessage]);
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
