import { z } from 'zod';
import { THRESHOLD_MIN, THRESHOLD_MAX } from './constants';
export const thresholdSchema = z.number().finite().min(THRESHOLD_MIN).max(THRESHOLD_MAX);
