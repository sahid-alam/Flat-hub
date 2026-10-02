import { getRandomBytes } from 'expo-crypto';

import { uuidv7 } from '@/domain/id';

export const newId = (): string => uuidv7(getRandomBytes(16));
