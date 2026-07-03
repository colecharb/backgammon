import { StatusBar } from 'expo-status-bar';
import { Provider } from 'jotai';
import React from 'react';
import { GameScreen } from './src/screens/GameScreen';

export default function App() {
  return (
    <Provider>
      <GameScreen />
      <StatusBar style="light" />
    </Provider>
  );
}
