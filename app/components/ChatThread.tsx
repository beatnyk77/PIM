import React from 'react';
import { View, Text, FlatList, ListRenderItem } from 'react-native';

// Temporary type for testing
export interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  timestamp: Date;
  isMe: boolean;
}

interface ChatThreadProps {
  messages: ChatMessage[];
}

export default function ChatThread({ messages }: ChatThreadProps) {
  const renderItem: ListRenderItem<ChatMessage> = ({ item }) => (
    <View className={`mb-2 max-w-[80%] p-3 rounded-lg ${
      item.isMe 
        ? 'bg-blue-500 self-end rounded-tr-none' 
        : 'bg-gray-200 self-start rounded-tl-none'
    }`}>
      <Text className={`${item.isMe ? 'text-white' : 'text-gray-800'}`}>
        {item.content}
      </Text>
      <Text className={`text-[10px] mt-1 ${item.isMe ? 'text-blue-100' : 'text-gray-500'}`}>
        {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );

  return (
    <FlatList
      data={messages}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      contentContainerStyle={{ padding: 16 }}
      inverted={false} // Typically true for chat, but keeping false for dummy list for now
    />
  );
}
