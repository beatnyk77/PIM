import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChatScreen from '../screens/ChatScreen';
import CommitmentsScreen from '../screens/CommitmentsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import GroupCreationScreen from '../screens/GroupCreationScreen';
import GroupDetailsScreen from '../screens/GroupDetailsScreen';
import GroupSettingsScreen from '../screens/GroupSettingsScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F2F2F7' }
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen 
          name="Profile" 
          component={ProfileScreen} 
          options={{ headerShown: true, title: 'My Profile' }}
        />
        <Stack.Screen 
          name="Chat" 
          component={ChatScreen} 
          options={{ headerShown: true, title: 'Chat' }}
        />
        <Stack.Screen 
          name="Commitments" 
          component={CommitmentsScreen} 
          options={{ headerShown: true, title: 'Dashboard' }}
        />
        <Stack.Screen 
          name="Settings" 
          component={SettingsScreen} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="GroupCreation" 
          component={GroupCreationScreen} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="GroupDetails" 
          component={GroupDetailsScreen} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="GroupSettings" 
          component={GroupSettingsScreen} 
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
