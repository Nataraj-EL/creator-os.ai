'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../../lib/store';
import { apiClient } from '../../../lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Upload, Loader2, CheckCircle2, AlertCircle,
  Trash2, FileText, Clock, ShieldAlert, BookOpen, FileCode
} from 'lucide-react';

interface KnowledgeDocument {
  documentId: string;
  workspaceId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  extractedText: string;
  wordCount: number;
  characterCount: number;
  status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';
  createdAt: string;
  updatedAt: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function KnowledgeBrainPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);

  // States
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<KnowledgeDocument | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Processing Steps
  const processingSteps = [
    "Uploading...",
    "Extracting content...",
    "Saving knowledge...",
    "Ready"
  ];

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Fetch document list
  const fetchHistory = async (workspaceId: string, selectIdAfterFetch?: string) => {
    setLoadingHistory(true);
    try {
      const response = await apiClient.get(`/api/v1/workspaces/${workspaceId}/knowledge`);
      if (response.data) {
        const fetchedList: KnowledgeDocument[] = response.data;
        setDocuments(fetchedList);

        if (fetchedList.length > 0) {
          if (selectIdAfterFetch) {
            const match = fetchedList.find(d => d.documentId === selectIdAfterFetch);
            if (match) {
              await fetchSingleDocument(workspaceId, match.documentId);
            } else {
              await fetchSingleDocument(workspaceId, fetchedList[0].documentId);
            }
          } else if (selectedDocument) {
            // Re-sync active selection if it exists
            const match = fetchedList.find(d => d.documentId === selectedDocument.documentId);
            if (match) {
              await fetchSingleDocument(workspaceId, match.documentId);
            } else {
              await fetchSingleDocument(workspaceId, fetchedList[0].documentId);
            }
          } else {
            await fetchSingleDocument(workspaceId, fetchedList[0].documentId);
          }
        } else {
          setSelectedDocument(null);
        }
      }
    } catch (err) {
      console.error("Failed to load knowledge assets:", err);
      addToast("Failed to load knowledge library.", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Fetch single document details (for preview)
  const fetchSingleDocument = async (workspaceId: string, docId: string) => {
    try {
      const response = await apiClient.get(`/api/v1/workspaces/${workspaceId}/knowledge/${docId}`);
      if (response.data) {
        setSelectedDocument(response.data);
      }
    } catch (err) {
      console.error("Failed to fetch document details:", err);
      addToast("Failed to open document.", "error");
    }
  };

  // Effect to reload on active workspace change
  useEffect(() => {
    if (activeWorkspace) {
      fetchHistory(activeWorkspace.id);
    } else {
      setDocuments([]);
      setSelectedDocument(null);
    }
  }, [activeWorkspace]);

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await uploadAndProcess(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await uploadAndProcess(file);
    }
  };

  const onUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Upload and process logic
  const uploadAndProcess = async (file: File) => {
    if (!activeWorkspace) return;

    // Validate extension
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (fileExtension !== '.pdf' && fileExtension !== '.docx' &&
        fileExtension !== '.txt' && fileExtension !== '.md') {
      addToast("Unsupported file type. Please upload .pdf, .docx, .txt, or .md", "error");
      return;
    }

    setUploading(true);
    setUploadStep(0);

    // Staged progress animation
    const stepInterval = setInterval(() => {
      setUploadStep((prev) => {
        if (prev < processingSteps.length - 2) return prev + 1;
        clearInterval(stepInterval);
        return prev;
      });
    }, 1000);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiClient.post(
        `/api/v1/workspaces/${activeWorkspace.id}/knowledge`,
        formData
      );

      clearInterval(stepInterval);
      setUploadStep(3); // Ready
      await new Promise(r => setTimeout(r, 400));

      if (response.data) {
        addToast("Document uploaded successfully!", "success");
        await fetchHistory(activeWorkspace.id, response.data.documentId);
      }
    } catch (err: any) {
      clearInterval(stepInterval);
      console.error(err);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || "Failed to upload document.";
      addToast(errorMsg, "error");
    } finally {
      setUploading(false);
    }
  };

  // Delete document handler
  const handleDeleteDocument = async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    if (!activeWorkspace) return;
    if (!confirm("Are you sure you want to delete this document from your Knowledge Brain?")) return;

    try {
      await apiClient.delete(`/api/v1/workspaces/${activeWorkspace.id}/knowledge/${docId}`);
      addToast("Document deleted", "info");

      const remaining = documents.filter(d => d.documentId !== docId);
      setDocuments(remaining);
      if (remaining.length > 0) {
        if (selectedDocument?.documentId === docId) {
          await fetchSingleDocument(activeWorkspace.id, remaining[0].documentId);
        }
      } else {
        setSelectedDocument(null);
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
      addToast("Failed to delete document.", "error");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Text preview with truncation strategy (50,000 characters limit)
  const renderPreview = (text: string) => {
    if (!text) return <p className="text-zinc-500 italic">No extracted text content available.</p>;

    const limit = 50000;
    const isTruncated = text.length > limit;
    const displayText = isTruncated ? text.substring(0, limit) : text;

    return (
      <div className="space-y-4">
        {isTruncated && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400 font-medium flex items-center gap-2">
            <ShieldAlert className="h-4.5 w-4.5 flex-shrink-0" />
            <span>Extracted text preview truncated (showing first 50,000 characters of {selectedDocument?.characterCount.toLocaleString()} total characters).</span>
          </div>
        )}
        <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed bg-zinc-950/40 p-5 rounded-2xl border border-white/[0.03] overflow-y-auto max-h-[600px] custom-scrollbar">
          {displayText}
        </pre>
      </div>
    );
  };

  const getStatusColor = (status: string) => {
    if (status === 'READY') return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
    if (status === 'FAILED') return 'text-rose-400 border-rose-500/20 bg-rose-500/5';
    return 'text-amber-400 border-amber-500/20 bg-amber-500/5';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-7xl mx-auto space-y-6">
      
      {/* Toast Notification Container */}
      <div className="fixed top-20 right-6 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl border text-xs font-medium backdrop-blur-md ${
                toast.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : toast.type === 'error'
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'
              }`}
            >
              {toast.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
              {toast.type === 'error' && <AlertCircle className="h-4 w-4" />}
              <span>{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header */}
      <div className="flex flex-shrink-0 justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Database className="h-7 w-7 text-cyan-400" />
            <span>Knowledge Brain</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Upload and organize transcripts, outlines, and core content to build your creator knowledge vault.</p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full items-stretch overflow-hidden">
        
        {/* LEFT COLUMN: Upload + Library List */}
        <div className="lg:col-span-4 flex flex-col gap-6 h-full overflow-hidden">
          
          {/* Upload Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={onUploadClick}
            className={`glass-card rounded-2xl border border-dashed flex flex-col justify-center items-center p-6 text-center cursor-pointer transition-all flex-shrink-0 relative overflow-hidden group ${
              dragActive
                ? 'border-cyan-400 bg-cyan-400/5 shadow-lg shadow-cyan-500/5'
                : 'border-white/10 hover:border-white/20 hover:bg-white/[0.01]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleFileChange}
            />

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-500/10 transition-all" />

            <div className="h-10 w-10 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-cyan-400 shadow-md group-hover:scale-105 transition-all">
              <Upload className="h-5 w-5" />
            </div>

            <h3 className="text-xs font-bold text-white mt-3.5">Upload Knowledge File</h3>
            <p className="text-[10px] text-zinc-500 mt-1 max-w-[200px] leading-relaxed">
              Drag and drop files here, or click to browse (.pdf, .docx, .txt, .md)
            </p>
          </div>

          {/* Library Assets List */}
          <div className="glass-card rounded-2xl border border-white/5 flex flex-col flex-1 overflow-hidden bg-card/10">
            <div className="p-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Knowledge Library</span>
              <span className="text-[10px] font-bold text-zinc-500 bg-white/5 px-2 py-0.5 rounded-full">
                {documents.length} Assets
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
                  <span className="text-[10px] text-zinc-500">Loading library...</span>
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <FileText className="h-8 w-8 text-zinc-600 mx-auto opacity-50" />
                  <p className="text-xs text-zinc-500">No knowledge assets uploaded</p>
                </div>
              ) : (
                documents.map((item) => (
                  <div
                    key={item.documentId}
                    onClick={() => fetchSingleDocument(activeWorkspace!.id, item.documentId)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group cursor-pointer ${
                      selectedDocument?.documentId === item.documentId
                        ? 'bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border-cyan-500/20 text-cyan-400'
                        : 'bg-white/[0.01] hover:bg-white/[0.03] border-white/[0.03] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="text-xs font-bold truncate text-white">{item.fileName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-zinc-500 flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          <span>
                            {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </span>
                        <span className="text-zinc-700">•</span>
                        <span className="text-[9px] text-zinc-500">{formatBytes(item.fileSize)}</span>
                        <span className="text-zinc-700">•</span>
                        <span className={`text-[8px] uppercase tracking-wider font-bold border px-1 rounded-md ${getStatusColor(item.status)}`}>
                          {item.status}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      <button
                        onClick={(e) => handleDeleteDocument(e, item.documentId)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-all"
                        title="Delete document"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Document Viewer / Empty Onboarding State */}
        <div className="lg:col-span-8 flex flex-col h-full overflow-hidden relative">
          
          <AnimatePresence mode="wait">
            
            {/* Upload/AI Processing Overlay */}
            {uploading && (
              <motion.div
                key="processing-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-background/80 backdrop-blur-md z-40 flex flex-col items-center justify-center gap-6"
              >
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-cyan-500/20 blur-xl animate-pulse" />
                  <Loader2 className="h-10 w-10 text-cyan-400 animate-spin relative" />
                </div>
                
                <div className="space-y-2 text-center max-w-sm">
                  <h3 className="text-sm font-bold text-white font-mono">Knowledge Brain Syncer</h3>
                  <p className="text-[11px] text-zinc-400 font-mono animate-pulse">
                    {processingSteps[uploadStep]}
                  </p>
                  
                  {/* Progress Bar */}
                  <div className="h-1.5 w-48 bg-white/[0.04] rounded-full overflow-hidden mt-3 mx-auto">
                    <motion.div
                      className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500"
                      initial={{ width: "0%" }}
                      animate={{ width: `${(uploadStep + 1) * 25}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Empty Onboarding Card */}
            {!selectedDocument && !uploading ? (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="glass-card rounded-2xl border border-white/5 p-8 flex flex-col justify-center items-center h-full text-center space-y-5 bg-card/5 relative overflow-hidden"
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />
                
                <div className="h-12 w-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400 mx-auto shadow-lg shadow-cyan-500/5">
                  <BookOpen className="h-6 w-6" />
                </div>
                
                <div className="space-y-1.5 max-w-md">
                  <h2 className="text-lg font-bold text-white">Your Workspace Knowledge Vault</h2>
                  <p className="text-xs text-zinc-400">
                    Upload transcripts, notes, scripts, or PDF/DOCX outlines on the left panel to populate your Creator Knowledge Brain. Extracted text will automatically sync here.
                  </p>
                </div>
              </motion.div>
            ) : (
              
              /* Document Details and Text Preview Viewer */
              selectedDocument && !uploading && (
                <motion.div
                  key="document-details"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="flex flex-col h-full overflow-y-auto space-y-6 pr-2 custom-scrollbar"
                >
                  
                  {/* Top Stats Metadata Card */}
                  <div className="glass-card rounded-2xl border border-white/5 p-5 bg-card/5 space-y-4 flex-shrink-0">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1 min-w-0 pr-4">
                        <h2 className="text-lg font-bold text-white truncate">{selectedDocument.fileName}</h2>
                        <p className="text-[11px] text-zinc-400">
                          Uploaded on {new Date(selectedDocument.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                      
                      <div className={`px-2.5 py-1 rounded-xl border text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${getStatusColor(selectedDocument.status)}`}>
                        {selectedDocument.status}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-white/5 pt-4">
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">File Size</span>
                        <span className="text-sm font-bold text-white font-mono">{formatBytes(selectedDocument.fileSize)}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Content Type</span>
                        <span className="text-xs font-bold text-zinc-300 truncate block font-mono" title={selectedDocument.contentType}>
                          {selectedDocument.contentType}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Word Count</span>
                        <span className="text-sm font-bold text-cyan-400 font-mono">{selectedDocument.wordCount.toLocaleString()}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Character Count</span>
                        <span className="text-sm font-bold text-indigo-400 font-mono">{selectedDocument.characterCount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Extracted Text Content Box */}
                  <div className="glass-card rounded-2xl border border-white/5 p-5 bg-card/5 space-y-4 flex-1 flex flex-col min-h-0">
                    <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                      <FileCode className="h-4.5 w-4.5 text-cyan-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Extracted Knowledge Content</span>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0">
                      {renderPreview(selectedDocument.extractedText)}
                    </div>
                  </div>

                </motion.div>
              )
            )}

          </AnimatePresence>

        </div>

      </div>

    </div>
  );
}
