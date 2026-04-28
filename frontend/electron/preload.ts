// Preload bridge that exposes the typed `electronAI` IPC surface to the
// renderer. The renderer never touches `ipcRenderer` directly: every
// call goes through `window.electronAI.*`, which lets us swap the
// transport (IPC ↔ HTTP fallback) without changing call sites.
//
// Channel names mirror the Phase 0/1 HTTP API so the contract is
// trivially reversible: the Go data-only backend may still proxy these
// shapes for non-Electron dev builds.

import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAI, InferenceRequest, StreamChunk } from './inference/adapter.js';

let streamSeq = 0;
const nextStreamID = () => `s_${Date.now().toString(36)}_${(++streamSeq).toString(36)}`;

const api: ElectronAI = {
  run: (req) => ipcRenderer.invoke('ai:run', req),
  stream: (req, onChunk, onDone, onError) => {
    const id = nextStreamID();
    const chunkChan = `ai:stream:chunk:${id}`;
    const doneChan = `ai:stream:done:${id}`;
    const errChan = `ai:stream:error:${id}`;

    const chunkListener = (_e: unknown, c: StreamChunk) => onChunk(c);
    const doneListener = () => {
      cleanup();
      onDone();
    };
    const errListener = (_e: unknown, message: string) => {
      cleanup();
      onError?.(new Error(message));
    };
    const cleanup = () => {
      ipcRenderer.removeListener(chunkChan, chunkListener);
      ipcRenderer.removeListener(doneChan, doneListener);
      ipcRenderer.removeListener(errChan, errListener);
    };

    ipcRenderer.on(chunkChan, chunkListener);
    ipcRenderer.on(doneChan, doneListener);
    ipcRenderer.on(errChan, errListener);

    ipcRenderer.send('ai:stream:start', { id, request: req });

    return () => {
      ipcRenderer.send('ai:stream:cancel', { id });
      cleanup();
    };
  },
  smartReply: (req) => ipcRenderer.invoke('ai:smart-reply', req),
  translate: (req) => ipcRenderer.invoke('ai:translate', req),
  extractTasks: (req) => ipcRenderer.invoke('ai:extract-tasks', req),
  summarizeThread: (req) => ipcRenderer.invoke('ai:summarize-thread', req),
  extractKAppTasks: (req) => ipcRenderer.invoke('ai:kapps-extract-tasks', req),
  prefillApproval: (req) => ipcRenderer.invoke('ai:prefill-approval', req),
  draftArtifact: (req) => ipcRenderer.invoke('ai:draft-artifact', req),
  unreadSummary: (req) => ipcRenderer.invoke('ai:unread-summary', req),
  modelStatus: () => ipcRenderer.invoke('model:status'),
  loadModel: (model) => ipcRenderer.invoke('model:load', { model }),
  unloadModel: (model) => ipcRenderer.invoke('model:unload', { model }),
  route: (req: InferenceRequest) => ipcRenderer.invoke('ai:route', req),
};

contextBridge.exposeInMainWorld('electronAI', api);
