import AsyncStorage from '@react-native-async-storage/async-storage';
import {createSessionRepository} from './sessionRepository.js';

export const sessionRepository = createSessionRepository(AsyncStorage);
export async function loadSessions() { return (await sessionRepository.load()).sessions; }
