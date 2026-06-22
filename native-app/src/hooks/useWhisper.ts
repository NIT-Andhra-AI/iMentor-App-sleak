import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { useSpeechToText, WHISPER_TINY_EN } from 'react-native-executorch';
import LiveAudioStream from '@fugood/react-native-audio-pcm-stream';
import { toByteArray } from 'base64-js';

export const useWhisper = () => {
  const { isReady, isGenerating, error, downloadProgress, stream, streamInsert, streamStop } = useSpeechToText({
    model: WHISPER_TINY_EN,
  });

  const [isRecording, setIsRecording] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  
  const streamGeneratorRef = useRef<any>(null);

  useEffect(() => {
    if (downloadProgress > 0 && downloadProgress < 1) {
      setIsDownloading(true);
    } else if (downloadProgress === 1) {
      setIsDownloading(false);
    }
  }, [downloadProgress]);

  useEffect(() => {
    if (error) {
      console.error('ExecuTorch Error:', error);
    }
  }, [error]);

  const processAudioStream = useCallback(async () => {
    try {
      // WHISPER_TINY_EN is an English-only model, so we must not pass a language parameter
      const generator = stream({ verbose: false });
      streamGeneratorRef.current = generator;
      
      for await (const chunk of generator) {
        // chunk contains committed and nonCommitted transcription
        const fullText = (chunk.committed.text + ' ' + chunk.nonCommitted.text).trim();
        if (fullText) {
          setTranscribedText(fullText);
        }
      }
      // When the generator finishes (after streamStop is called), we can clear the stopping flag
      setIsStopping(false);
    } catch (e) {
      console.error('Streaming generator error:', e);
      setIsStopping(false);
    }
  }, [stream]);

  const startRecording = useCallback(async () => {
    if (!isReady) {
      Alert.alert('Model not ready', 'Please wait for the AI model to finish loading.');
      return;
    }
    
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission Required',
            message: 'iMentor needs access to your microphone so you can dictate messages to your AI offline.',
            buttonPositive: 'OK',
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Microphone Error', 'Microphone permission denied.');
          return;
        }
      }
      
      setIsRecording(true);
      setTranscribedText('...listening...');
      
      // Start the inference generator loop
      processAudioStream();
      
      LiveAudioStream.init({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 1, // MIC
        bufferSize: 4096
      });
      
      LiveAudioStream.on('data', (data: string) => {
        // Convert base64 -> Uint8Array -> Int16Array -> Float32Array
        const uint8Array = toByteArray(data);
        const int16Array = new Int16Array(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength / 2);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0;
        }
        
        // Feed into ExecuTorch
        streamInsert(float32Array);
      });
      
      LiveAudioStream.start();
    } catch (e) {
      console.error('Failed to start recording:', e);
      Alert.alert('Microphone Error', 'Could not start the offline microphone.');
      setIsRecording(false);
    }
  }, [isReady, processAudioStream, streamInsert]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    try {
      LiveAudioStream.stop();
      
      // Immediately set UI state so React can render "Transcribing..."
      setIsRecording(false);
      setIsStopping(true);
      
      // streamStop() triggers a heavy synchronous C++ JSI call that blocks the JavaScript thread.
      // We wrap it in a setTimeout so React Native has 150ms to paint the "Transcribing..." UI 
      // to the screen BEFORE the thread gets frozen. 50ms was too fast for some devices.
      setTimeout(() => {
        streamStop();
      }, 150);
      
      // Clear the ...listening... indicator if no valid text was captured
      setTranscribedText(prev => prev === '...listening...' ? '' : prev);
      
      // We no longer call setIsRecording(false) here because it's already called above.
    } catch (e) {
      console.error('Failed to stop recording:', e);
      setIsRecording(false);
    }
  }, [isRecording, streamStop]);

  return {
    isReady,
    isDownloading,
    downloadProgress: downloadProgress * 100, // Normalized to 0-100 like before
    isRecording,
    isStopping,
    isGenerating,
    transcribedText,
    startRecording,
    stopRecording,
    setTranscribedText
  };
};
