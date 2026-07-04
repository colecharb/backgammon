import { StatusBar } from 'expo-status-bar';
import { Provider } from 'jotai';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameScreen } from './src/screens/GameScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <Provider>
        <GameScreen />
        <StatusBar style="light" />
      </Provider>
    </SafeAreaProvider>
  );
}
