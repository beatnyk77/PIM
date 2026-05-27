import React from 'react';
import { View, Text, FlatList, ListRenderItem, TouchableOpacity, Image } from 'react-native';
import { ChatMessage } from '../services/storage/StateManager';
import { Audio } from 'expo-av';

interface ChatThreadProps {
  messages: ChatMessage[];
  onLongPressMessage?: (message: ChatMessage) => void;
}

export default function ChatThread({ messages, onLongPressMessage }: ChatThreadProps) {
  const playSound = async (uri: string) => {
    try {
        const { sound } = await Audio.Sound.createAsync({ uri });
        await sound.playAsync();
    } catch (e) {
        console.error('Playback failed', e);
    }
  };

  const renderItem: ListRenderItem<ChatMessage> = ({ item }) => {
    if (item.senderId === 'system') {
      return (
        <View className="mb-4 my-2 px-6 py-2 rounded-xl bg-gray-100 border border-gray-200 self-center max-w-[90%] shadow-sm">
          <Text className="text-gray-700 text-xs font-semibold text-center leading-5">{item.content}</Text>
          <Text className="text-gray-400 text-[10px] text-center mt-1">
             System • {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      );
    }

    return (
      <TouchableOpacity 
        onLongPress={() => onLongPressMessage?.(item)}
        delayLongPress={300}
        activeOpacity={0.8}
        className={`mb-2 max-w-[80%] p-3 rounded-lg ${
          item.isMe 
            ? 'bg-blue-500 self-end rounded-tr-none' 
            : 'bg-gray-200 self-start rounded-tl-none'
        }`}
      >
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
      </TouchableOpacity>
    );
  };

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
