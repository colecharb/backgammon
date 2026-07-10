import { deserializeNet } from './network';
import weightsJson from './weights/engine-v0.json';

/**
 * The shipped engine-v0 network, deserialized once at module scope.
 * Retrain with `npm run train`, then replace weights/engine-v0.json with
 * train/checkpoints/latest.json.
 */
export const defaultNet = deserializeNet(weightsJson).net;
