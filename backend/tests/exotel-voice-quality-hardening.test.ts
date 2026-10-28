import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebSocket } from "ws";
import { ExotelStreamGatewayService, StreamSessionContext } from "../src/services/telephony/exotel-stream-gateway.service.js";
import { VoiceGatewayService } from "../src/services/telephony/voice-gateway.service.js";
import { VoiceSessionRepository } from "../src/repositories/voice-session.repository.js";
import { SarvamService } from "../src/services/telephony/sarvam.service.js";
import {
  chunkExotelAudioBuffer,
  pcmToWav,
  calculatePcmRms,
} from "../src/services/telephony/audio-codec.js";

describe("Exotel + Sarvam Voice Quality & Stream Hardening Tests", () => {
  let sessionRepo: VoiceSessionRepository;
  let sarvamService: SarvamService;
  let gatewayService: VoiceGatewayService;
  let streamGateway: ExotelStreamGatewayService;

  beforeEach(() => {
    sessionRepo = new VoiceSessionRepository(null);
    sarvamService = new SarvamService();
    gatewayService = new VoiceGatewayService(
      sessionRepo,
      sarvamService,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      { emitDomainEvent: vi.fn() } as any
    );
    streamGateway = new ExotelStreamGatewayService(gatewayService, sessionRepo, sarvamService);
  });

  describe("1. Exotel Chunk Sizing & 320-Byte Multiple Rule", () => {
    it("chunks audio into frames >= 3200 bytes and exact multiples of 320", () => {
      // 10,000 bytes of audio
      const audio = Buffer.alloc(10000, 42);
      const chunks = chunkExotelAudioBuffer(audio, 3200, 320);

      expect(chunks.length).toBe(4);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        expect(chunk.length).toBeGreaterThanOrEqual(3200);
        expect(chunk.length % 320).toBe(0);
      }

      // First 3 chunks should be 3200 bytes
      expect(chunks[0].length).toBe(3200);
      expect(chunks[1].length).toBe(3200);
      expect(chunks[2].length).toBe(3200);
      // Trailing chunk padded to 3200 bytes
      expect(chunks[3].length).toBe(3200);
    });

    it("pads small unaligned buffers to an exact multiple of 320", () => {
      const smallUnaligned = Buffer.alloc(1500, 10);
      const chunks = chunkExotelAudioBuffer(smallUnaligned, 3200, 320);

      expect(chunks.length).toBe(1);
      expect(chunks[0].length % 320).toBe(0);
      expect(chunks[0].length).toBe(1600); // 1500 padded to next multiple of 320 (1600)
    });
  });

  describe("2. Audio Format Negotiation & Outbound Linear PCM", () => {
    it("defaults to audio/x-linear (raw 16-bit PCM) for Exotel stream sessions", async () => {
      const mockSocket: any = {
        readyState: WebSocket.OPEN,
        send: vi.fn(),
      };

      vi.spyOn(sarvamService, "textToSpeech").mockResolvedValue({
        audios: [pcmToWav(Buffer.alloc(3200, 10), 8000).toString("base64")],
      });

      const context: StreamSessionContext = {
        streamSid: null,
        callSid: null,
        sessionId: null,
        session: null,
        mediaFormat: { encoding: "audio/x-linear", sampleRate: 8000, channels: 1 },
        language: "en-IN",
        state: "INITIALIZING",
        turnCount: 0,
        maxTurns: 10,
        startTime: Date.now(),
        durationTimer: null,
        audioBufferChunks: [],
        turnSilenceChunks: 0,
        turnTotalChunks: 0,
        isProcessingTurn: false,
        isPlayingGreeting: false,
        initialGreetingSent: false,
        isStopped: false,
      };

      // Exotel sends start event with audio/x-linear
      await streamGateway.handleStreamEvent(mockSocket, context, {
        event: "start",
        start: {
          streamSid: "stream_pcm_01",
          callSid: "call_pcm_01",
          mediaFormat: {
            encoding: "audio/x-linear",
            sampleRate: 8000,
            channels: 1,
          },
        },
      });

      expect(context.mediaFormat.encoding).toBe("audio/x-linear");
      expect(context.streamSid).toBe("stream_pcm_01");
    });

    it("streams linear 16-bit PCM without mulaw distortion when encoding is audio/x-linear", async () => {
      const receivedMessages: any[] = [];
      const mockSocket: any = {
        readyState: WebSocket.OPEN,
        send: vi.fn((msg: string) => {
          receivedMessages.push(JSON.parse(msg));
        }),
      };

      const context: StreamSessionContext = {
        streamSid: "stream_test_linear",
        callSid: "call_test_linear",
        sessionId: "vses_test_linear",
        session: null,
        mediaFormat: { encoding: "audio/x-linear", sampleRate: 8000, channels: 1 },
        language: "en-IN",
        state: "INITIALIZING",
        turnCount: 0,
        maxTurns: 10,
        startTime: Date.now(),
        durationTimer: null,
        audioBufferChunks: [],
        turnSilenceChunks: 0,
        turnTotalChunks: 0,
        isProcessingTurn: false,
        isPlayingGreeting: false,
        initialGreetingSent: false,
        isStopped: false,
      };

      // Mock Sarvam TTS returning 16-bit PCM WAV (1 second = 16000 bytes)
      const rawPcm = Buffer.alloc(16000, 120);
      const wav = pcmToWav(rawPcm, 8000);
      vi.spyOn(sarvamService, "textToSpeech").mockResolvedValue({
        audios: [wav.toString("base64")],
      });

      await streamGateway.synthesizeAndStreamResponse(
        mockSocket,
        context,
        "Welcome to SwasthyaSetu",
        "turn_welcome"
      );

      const mediaMessages = receivedMessages.filter((m) => m.event === "media");
      expect(mediaMessages.length).toBeGreaterThan(0);

      // Verify chunks are Exotel-compliant (3200 bytes each)
      const firstChunkPayload = Buffer.from(mediaMessages[0].media.payload, "base64");
      expect(firstChunkPayload.length).toBe(3200);
      expect(firstChunkPayload.length % 320).toBe(0);

      // Verify mark event sent
      const markMessages = receivedMessages.filter((m) => m.event === "mark");
      expect(markMessages.length).toBe(1);
      expect(markMessages[0].mark.name).toBe("turn_welcome");

      // Verify physical duration calculation (16000 bytes / 16 bytes/ms = 1000ms)
      // Fallback timer should be set to ~1400ms (1000 + 400)
      expect(context.isPlayingOutbound).toBe(true);
      expect(context.playbackFallbackTimer).toBeDefined();
    });
  });

  describe("3. Barge-In & Clear Event Handling", () => {
    it("detects caller barge-in during playback and sends clear event to Exotel", async () => {
      const outboundMessages: any[] = [];
      const mockSocket: any = {
        readyState: WebSocket.OPEN,
        send: vi.fn((msg: string) => {
          outboundMessages.push(JSON.parse(msg));
        }),
      };

      const context: StreamSessionContext = {
        streamSid: "stream_barge_01",
        callSid: "call_barge_01",
        sessionId: "vses_barge_01",
        session: null,
        mediaFormat: { encoding: "audio/x-linear", sampleRate: 8000, channels: 1 },
        language: "en-IN",
        state: "PLAYING_RESPONSE",
        turnCount: 0,
        maxTurns: 10,
        startTime: Date.now(),
        durationTimer: null,
        audioBufferChunks: [],
        turnSilenceChunks: 0,
        turnTotalChunks: 0,
        isProcessingTurn: false,
        isPlayingGreeting: false,
        isPlayingOutbound: true, // Assistant is speaking!
        currentMarkName: "speaking_prompt",
        initialGreetingSent: true,
        isStopped: false,
      };

      // Create loud speech chunk (energy > BARGE_IN_ENERGY_THRESHOLD = 350)
      const loudPcm = Buffer.alloc(320);
      for (let i = 0; i < 160; i++) {
        loudPcm.writeInt16LE(4000, i * 2);
      }
      expect(calculatePcmRms(loudPcm)).toBeGreaterThan(350);

      // Frame 1 of speech during playback
      await streamGateway.handleStreamEvent(mockSocket, context, {
        event: "media",
        streamSid: "stream_barge_01",
        media: { payload: loudPcm.toString("base64") },
      });
      // First frame primes bargeInFrames = 1
      expect(context.bargeInFrames).toBe(1);
      expect(context.isPlayingOutbound).toBe(true);

      // Frame 2 of speech confirms intentional interruption
      await streamGateway.handleStreamEvent(mockSocket, context, {
        event: "media",
        streamSid: "stream_barge_01",
        media: { payload: loudPcm.toString("base64") },
      });

      // Verify outbound 'clear' message was sent to Exotel to halt playback
      const clearMessages = outboundMessages.filter((m) => m.event === "clear");
      expect(clearMessages.length).toBe(1);
      expect(clearMessages[0].streamSid).toBe("stream_barge_01");

      // Verify playback state was halted and buffer has caller speech
      expect(context.isPlayingOutbound).toBe(false);
      expect(context.audioBufferChunks.length).toBe(1);
    });

    it("handles inbound clear event from Exotel by resetting playback state", async () => {
      const mockSocket: any = {
        readyState: WebSocket.OPEN,
        send: vi.fn(),
      };

      const context: StreamSessionContext = {
        streamSid: "stream_inbound_clear",
        callSid: "call_inbound_clear",
        sessionId: "vses_inbound_clear",
        session: null,
        mediaFormat: { encoding: "audio/x-linear", sampleRate: 8000, channels: 1 },
        language: "kn-IN",
        state: "PLAYING_RESPONSE",
        turnCount: 1,
        maxTurns: 10,
        startTime: Date.now(),
        durationTimer: null,
        audioBufferChunks: [Buffer.alloc(100)],
        turnSilenceChunks: 5,
        turnTotalChunks: 10,
        isProcessingTurn: false,
        isPlayingGreeting: false,
        isPlayingOutbound: true,
        currentMarkName: "active_mark",
        initialGreetingSent: true,
        isStopped: false,
      };

      await streamGateway.handleStreamEvent(mockSocket, context, {
        event: "clear",
        streamSid: "stream_inbound_clear",
      });

      expect(context.isPlayingOutbound).toBe(false);
      expect(context.currentMarkName).toBeNull();
      expect(context.audioBufferChunks.length).toBe(0);
      expect(context.isWaitingForCaller).toBe(true);
    });
  });

  describe("4. Intent Fallback Policy & Bounded Reprompts", () => {
    it("implements bounded 3-tier fallback on repeated UNKNOWN intent", async () => {
      const mockSocket: any = {
        readyState: WebSocket.OPEN,
        send: vi.fn(),
      };

      const context: StreamSessionContext = {
        streamSid: "stream_fallback_01",
        callSid: "call_fallback_01",
        sessionId: "vses_fallback_01",
        session: { id: "vses_fallback_01", language: "hi-IN" } as any,
        mediaFormat: { encoding: "audio/x-linear", sampleRate: 8000, channels: 1 },
        language: "hi-IN",
        state: "LISTENING",
        turnCount: 0,
        maxTurns: 10,
        startTime: Date.now(),
        durationTimer: null,
        audioBufferChunks: [Buffer.alloc(3200, 10)],
        turnSilenceChunks: 0,
        turnTotalChunks: 1,
        isProcessingTurn: false,
        isPlayingGreeting: false,
        initialGreetingSent: true,
        isStopped: false,
        consecutiveFallbacks: 0,
      };

      // Mock STT
      vi.spyOn(sarvamService, "speechToText").mockResolvedValue({
        transcript: "कुछ समझ नहीं आया",
        language_code: "hi-IN",
      });

      // Mock UNKNOWN intent from NLU
      vi.spyOn(gatewayService, "processTurn").mockResolvedValue({
        sessionId: "vses_fallback_01",
        status: "ACTIVE",
        verificationStatus: "UNVERIFIED",
        detectedIntent: "UNKNOWN",
        textResponse: "",
        shouldEndCall: false,
        language: "hi-IN",
      });

      const streamSpy = vi.spyOn(streamGateway, "synthesizeAndStreamResponse").mockResolvedValue();

      // Turn 1 -> First UNKNOWN: ask caller to repeat
      await streamGateway.processSpeechTurn(mockSocket, context);
      expect(context.consecutiveFallbacks).toBe(1);
      expect(streamSpy).toHaveBeenCalledWith(
        mockSocket,
        context,
        expect.stringContaining("पुनः कहें"),
        "turn_1"
      );

      // Turn 2 -> Second UNKNOWN: provide structured guidance
      context.audioBufferChunks = [Buffer.alloc(3200, 10)];
      await streamGateway.processSpeechTurn(mockSocket, context);
      expect(context.consecutiveFallbacks).toBe(2);
      expect(streamSpy).toHaveBeenCalledWith(
        mockSocket,
        context,
        expect.stringContaining("सरकारी स्वास्थ्य योजनाओं"),
        "turn_2"
      );

      // Turn 3 -> Third UNKNOWN: gracefully conclude and terminate
      context.audioBufferChunks = [Buffer.alloc(3200, 10)];
      await streamGateway.processSpeechTurn(mockSocket, context);
      expect(context.consecutiveFallbacks).toBe(3);
      expect(streamSpy).toHaveBeenCalledWith(
        mockSocket,
        context,
        expect.stringContaining("धन्यवाद"),
        "turn_3"
      );
    });
  });
});
