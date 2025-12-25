import "./global.css";
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './navigation';

export default function App() {
  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}
