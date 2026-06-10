'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthStore } from '../../../lib/store';
import { apiClient } from '../../../lib/api-client';
import { FolderKanban, Plus, Sparkles, Settings, Trash2, Edit2, Loader2, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function WorkspacesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaces = useAuthStore((state) => state.workspaces);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const setActiveWorkspace = useAuthStore((state) => state.setActiveWorkspace);
  const updateWorkspaces = useAuthStore((state) => state.updateWorkspaces);

  // Modals Local UI State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Form Fields State
  const [newName, setNewName] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState<{ id: string; name: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Check URL params for auto-open create modal
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setCreateModalOpen(true);
      // Clean up URL query
      router.replace('/dashboard/workspaces');
    }
  }, [searchParams, router]);

  const handleRefreshList = async () => {
    try {
      const response = await apiClient.get('/api/v1/workspaces');
      if (response.data) {
        updateWorkspaces(response.data);
      }
    } catch (err) {
      console.error("Failed to refresh workspaces list:", err);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setActionLoading(true);
    setFormError(null);
    try {
      const response = await apiClient.post('/api/v1/workspaces', { name: newName });
      if (response.data) {
        await handleRefreshList();
        setCreateModalOpen(false);
        setNewName('');
      }
    } catch (err: any) {
      console.error(err);
      setFormError(err.response?.data?.error || err.response?.data?.message || "Failed to create workspace.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace || !newName.trim()) return;
    setActionLoading(true);
    setFormError(null);
    try {
      await apiClient.put(`/api/v1/workspaces/${selectedWorkspace.id}`, { name: newName });
      await handleRefreshList();
      setEditModalOpen(false);
      setSelectedWorkspace(null);
      setNewName('');
    } catch (err: any) {
      console.error(err);
      setFormError(err.response?.data?.error || err.response?.data?.message || "Failed to update workspace.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!selectedWorkspace) return;
    setActionLoading(true);
    setFormError(null);
    try {
      await apiClient.delete(`/api/v1/workspaces/${selectedWorkspace.id}`);
      await handleRefreshList();
      setDeleteConfirmOpen(false);
      setSelectedWorkspace(null);
    } catch (err: any) {
      console.error(err);
      setFormError(err.response?.data?.error || err.response?.data?.message || "Failed to delete workspace.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSwitchWorkspace = async (w: any) => {
    try {
      await apiClient.post(`/api/v1/workspaces/${w.id}/activate`);
      setActiveWorkspace(w);
      router.refresh();
    } catch (err) {
      console.error("Failed to switch workspace context:", err);
      setActiveWorkspace(w);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Brand Workspaces</h1>
          <p className="text-sm text-zinc-400 mt-1">Configure individual brands, accounts, and custom secrets per channel workspace.</p>
        </div>
        <button 
          onClick={() => {
            setFormError(null);
            setNewName('');
            setCreateModalOpen(true);
          }}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-medium text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/10 transition-all border border-transparent"
        >
          <Plus className="h-4 w-4" />
          <span>New Workspace</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {workspaces.map((w) => {
          const isActive = activeWorkspace?.id === w.id;
          return (
            <motion.div 
              key={w.id} 
              whileHover={{ 
                y: -6, 
                scale: 1.02, 
                borderColor: isActive ? "rgba(56, 189, 248, 0.55)" : "rgba(255, 255, 255, 0.25)",
                boxShadow: isActive 
                  ? "0 20px 40px -10px rgba(56, 189, 248, 0.15)" 
                  : "0 20px 40px -10px rgba(0, 0, 0, 0.4)",
                transition: { type: "spring", stiffness: 400, damping: 25 }
              }}
              className={`glass-card rounded-2xl p-6 border ${
                isActive 
                  ? 'border-cyan-500/30 bg-cyan-950/5' 
                  : 'border-white/5'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${isActive ? 'bg-cyan-500/10 text-cyan-400' : 'bg-white/[0.03] text-zinc-400'}`}>
                    <FolderKanban className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      {w.name}
                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-semibold uppercase tracking-wider">
                          <Sparkles className="h-2.5 w-2.5" />
                          <span>Active</span>
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">Status: Active & Connected</p>
                  </div>
                </div>
                
                <div className="flex gap-1">
                  <button 
                    onClick={() => {
                      setFormError(null);
                      setSelectedWorkspace(w);
                      setNewName(w.name);
                      setEditModalOpen(true);
                    }}
                    className="p-2 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-zinc-300 transition-all focus:outline-none"
                    title="Rename Workspace"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button 
                    onClick={() => {
                      setFormError(null);
                      setSelectedWorkspace(w);
                      setDeleteConfirmOpen(true);
                    }}
                    className="p-2 hover:bg-red-500/10 rounded-lg text-zinc-500 hover:text-red-400 transition-all focus:outline-none"
                    title="Delete Workspace"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                {!isActive ? (
                  <button 
                    onClick={() => handleSwitchWorkspace(w)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-white font-medium text-xs cursor-pointer transition-all focus:outline-none"
                  >
                    Switch to Workspace
                  </button>
                ) : (
                  <div className="flex-1 text-center py-2 text-xs font-semibold text-cyan-400 bg-cyan-500/5 border border-cyan-500/10 rounded-xl select-none">
                    Currently Selected
                  </div>
                )}
                <button 
                  onClick={() => router.push('/dashboard/settings')}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-medium text-xs cursor-pointer transition-all border border-cyan-500/10 focus:outline-none"
                >
                  Configure Profile
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* CREATE WORKSPACE MODAL */}
      <AnimatePresence>
        {createModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-white">Create Brand Workspace</h3>
                <button 
                  onClick={() => setCreateModalOpen(false)}
                  className="p-1.5 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-zinc-300 transition-all cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start gap-2">
                  <span>⚠️</span>
                  <div>{formError}</div>
                </div>
              )}

              <form onSubmit={handleCreateWorkspace} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Workspace Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Finance Hub, Gaming Channel"
                    className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-3 px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                    required
                    autoFocus
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-white font-medium text-xs cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-medium text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                    Create Workspace
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT WORKSPACE MODAL */}
      <AnimatePresence>
        {editModalOpen && selectedWorkspace && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-white">Rename Workspace</h3>
                <button 
                  onClick={() => {
                    setEditModalOpen(false);
                    setSelectedWorkspace(null);
                  }}
                  className="p-1.5 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-zinc-300 transition-all cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start gap-2">
                  <span>⚠️</span>
                  <div>{formError}</div>
                </div>
              )}

              <form onSubmit={handleUpdateWorkspace} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">New Workspace Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Enter workspace name"
                    className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/20 focus:border-cyan-500/50 rounded-xl py-3 px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                    required
                    autoFocus
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditModalOpen(false);
                      setSelectedWorkspace(null);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-white font-medium text-xs cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-medium text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {deleteConfirmOpen && selectedWorkspace && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-red-500/10 text-red-400 rounded-xl">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Delete Workspace</h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Are you absolutely sure you want to delete <span className="font-semibold text-white">"{selectedWorkspace.name}"</span>?
                  </p>
                </div>
              </div>

              <p className="text-xs text-zinc-500 leading-relaxed mb-6">
                Deleting this workspace will also soft-delete all associated configurations, connected profiles, and data storage. This action can be reverted by platform administrators, but will immediately become inactive in your studio.
              </p>

              {formError && (
                <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start gap-2">
                  <span>⚠️</span>
                  <div>{formError}</div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmOpen(false);
                    setSelectedWorkspace(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-white font-medium text-xs cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteWorkspace}
                  disabled={actionLoading}
                  className="px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white font-medium text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                  Delete Workspace
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function WorkspacesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-cyan-400 animate-spin" />
      </div>
    }>
      <WorkspacesContent />
    </Suspense>
  );
}
