import React from 'react';
import { View, Text, FlatList, ListRenderItem, TouchableOpacity, Image } from 'react-native';
import { ChatMessage } from '../services/storage/StateManager';
import { Audio } from 'expo-av';

interface ChatThreadProps {
  messages: ChatMessage[];
}

export default function ChatThread({ messages }: ChatThreadProps) {
  const playSound = async (uri: string) => {
    try {
        const { sound } = await Audio.Sound.createAsync({ uri });
        await sound.playAsync();
    } catch (e) {
        console.error('Playback failed', e);
    }
  };

  const renderItem: ListRenderItem<ChatMessage> = ({ item }) => (
    <View className={`mb-2 max-w-[80%] p-3 rounded-lg ${
      item.isMe 
        ? 'bg-blue-500 self-end rounded-tr-none' 
        : 'bg-gray-200 self-start rounded-tl-none'
    }`}>
      {item.type === 'image' && item.mediaUri ? (
        <Image source={{ uri: item.mediaUri }} className="w-48 h-32 rounded-lg" resizeMode="cover" />
      ) : item.type === 'audio' && item.mediaUri ? (
        <TouchableOpacity onPress={() => playSound(item.mediaUri!)} className="flex-row items-center">
            <Text className="text-2xl mr-2">▶️</Text>
            <Text className={`${item.isMe ? 'text-white' : 'text-gray-800'}`}>Voice Note</Text>
        </TouchableOpacity>
      ) : (
        <Text className={`${item.isMe ? 'text-white' : 'text-gray-800'}`}>
            {item.content}
        </Text>
      )}
      <View className="flex-row justify-end items-center mt-1">
        <Text className={`text-[10px] ${item.isMe ? 'text-blue-100' : 'text-gray-500'}`}>
            {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {item.isMe && item.status && (
            <Text className="text-[10px] ml-1 text-blue-100 font-bold">
                {item.status === 'read' ? '✓✓' : '✓'}
            </Text>
        )}
      </View>
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
