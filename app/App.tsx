import "./global.css";
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

export default function App() {
  return (
    <View className="flex-1 bg-background items-center justify-center">
      <Text className="text-primary text-lg font-bold">Open up App.tsx to start working on your app!</Text>
      <Text className="text-secondary mt-2">NativeWind Configured!</Text>
      <StatusBar style="auto" />
    </View>
  );
}
