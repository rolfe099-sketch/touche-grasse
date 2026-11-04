import { openDatabaseAsync } from 'expo-sqlite';
import { openSQLStorage } from './sqlite';
export async function openStorage() { return openSQLStorage(await openDatabaseAsync('touche-grasse.sqlite')); }
