/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// Fix: Import the 'Video' type from '@google/genai' to use in GenerateVideoParams.
import {Video} from '@google/genai';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
}

// Fix: Define and export the 'GenerationMode' enum which was missing.
export enum GenerationMode {
  TEXT_TO_VIDEO = 'TEXT_TO_VIDEO',
  FRAMES_TO_VIDEO = 'FRAMES_TO_VIDEO',
  REFERENCES_TO_VIDEO = 'REFERENCES_TO_VIDEO',
  EXTEND_VIDEO = 'EXTEND_VIDEO',
}

// Fix: Define and export the 'FrameData' interface to structure image data for video generation.
export interface FrameData {
  base64: string;
  file: {
    name: string;
    type: string;
  };
}

// Fix: Define and export the 'GenerateVideoParams' interface which was missing.
export interface GenerateVideoParams {
  model: string;
  prompt?: string;
  resolution: '720p' | '1080p';
  aspectRatio?: '16:9' | '9:16';
  mode: GenerationMode;
  startFrame?: FrameData;
  endFrame?: FrameData;
  isLooping?: boolean;
  referenceImages?: FrameData[];
  styleImage?: FrameData;
  inputVideoObject?: Video;
}
