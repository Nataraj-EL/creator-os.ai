'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../../lib/store';
import { apiClient } from '../../../lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, FileText, Loader2, Wand2, Search, Filter, 
  ChevronDown, Copy, Download, Trash2, Plus, Sparkles, 
  AlertCircle, FileDown, CheckCircle2, ChevronRight,
  FolderKanban, Calendar, Clock, BarChart3, Edit3, ArrowRight
} from 'lucide-react';

interface ContentVariant {
  id: string;
  variantType: 'HOOK' | 'CTA';
  content: string;
}

interface ContentProject {
  projectId: string;
  workspaceId: string;
  title: string;
  topic: string;
  primaryGoal: string;
  hook: string;
  script: string;
  cta: string;
  status: string; // DRAFT, COMPLETED, SCHEDULED
  variants: ContentVariant[];
  createdAt: string;
  updatedAt: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const TARGET_FORMAT_LABELS: Record<string, string> = {
  LINKEDIN_POST: 'LinkedIn Post',
  INSTAGRAM_CAROUSEL: 'Instagram Carousel',
  X_THREAD: 'X Thread',
  YOUTUBE_COMMUNITY: 'YouTube Community Post',
  INSTAGRAM_CAPTION: 'Instagram Caption',
  EMAIL_NEWSLETTER: 'Email Newsletter',
};

const stripMarkdown = (text: string) => {
  if (!text) return '';
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1');
};

const normalizeBullets = (text: string) => {
  if (!text) return '';
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('+ ')) {
        const indent = line.substring(0, line.indexOf(trimmed));
        const rest = trimmed.substring(2);
        return `${indent}• ${rest}`;
      }
      return line;
    })
    .join('\n');
};

const renderFormattedText = (text: string) => {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const parsedLine = parts.map((part, partIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={partIdx} className="font-extrabold text-white">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
    return (
      <div key={lineIdx} className="min-h-[1.5rem]">
        {parsedLine}
      </div>
    );
  });
};

export default function ContentStudioPage({ defaultTool = 'scriptwriter' }: { defaultTool?: 'scriptwriter' | 'repurposer' } = {}) {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);

  // States
  const [projects, setProjects] = useState<ContentProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ContentProject | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);

  // Repurposer States
  const [activeTool, setActiveTool] = useState<'scriptwriter' | 'repurposer'>(defaultTool);
  const [repurposeContentText, setRepurposeContentText] = useState('');
  const [repurposeSourceType, setRepurposeSourceType] = useState('SCRIPT');
  const [repurposeTargetFormat, setRepurposeTargetFormat] = useState('LINKEDIN_POST');
  const [repurposing, setRepurposing] = useState(false);
  const [repurposeResult, setRepurposeResult] = useState<{
    title: string;
    content: string;
    suggestedHashtags: string[];
    suggestedCTA: string;
  } | null>(null);
  
  // Onboarding/Generation Form State
  const [newTitle, setNewTitle] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newPrimaryGoal, setNewPrimaryGoal] = useState('Reach');
  const [isOnboarding, setIsOnboarding] = useState(true);

  // Search & Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'alphabetical'>('newest');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Editor Draft State (for debounced autosave)
  const [editorTitle, setEditorTitle] = useState('');
  const [editorTopic, setEditorTopic] = useState('');
  const [editorPrimaryGoal, setEditorPrimaryGoal] = useState('Reach');
  const [editorHook, setEditorHook] = useState('');
  const [editorScript, setEditorScript] = useState('');
  const [editorCta, setEditorCta] = useState('');
  const [editorStatus, setEditorStatus] = useState('DRAFT');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  // UI tabs and Platform metadata
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit');
  const [primaryPlatform, setPrimaryPlatform] = useState<string>('YouTube');

  // Title expanding textarea
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Export dropdown states
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (titleTextareaRef.current) {
      titleTextareaRef.current.style.height = 'auto';
      titleTextareaRef.current.style.height = `${titleTextareaRef.current.scrollHeight}px`;
    }
  }, [editorTitle]);

  // Refs for debouncing
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>('');

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  // Generation Loading Step Titles
  const generationSteps = [
    "Analyzing Creator Profile & Niche...",
    "Querying target platform layout standards...",
    "Synthesizing deterministic script hook variations...",
    "Formulating primary script call to actions...",
    "Finalizing drafting templates..."
  ];

  // Fetch all content projects
  const fetchProjects = async (workspaceId: string, selectIdAfterFetch?: string) => {
    setLoadingProjects(true);
    try {
      const response = await apiClient.get(`/api/v1/workspaces/${workspaceId}/content`);
      if (response.data) {
        const fetchedList: ContentProject[] = response.data;
        setProjects(fetchedList);
        
        if (fetchedList.length > 0) {
          if (selectIdAfterFetch) {
            const match = fetchedList.find(p => p.projectId === selectIdAfterFetch);
            if (match) {
              selectProjectDetails(match);
            } else {
              selectProjectDetails(fetchedList[0]);
            }
          } else if (!selectedProject) {
            selectProjectDetails(fetchedList[0]);
          } else {
            // Keep selected project up to date
            const match = fetchedList.find(p => p.projectId === selectedProject.projectId);
            if (match) {
              setSelectedProject(match);
            } else {
              selectProjectDetails(fetchedList[0]);
            }
          }
        } else {
          setSelectedProject(null);
          setIsOnboarding(true);
        }
      }
    } catch (err: any) {
      console.error("Failed to fetch projects:", err);
      addToast("Failed to load content projects", "error");
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    if (activeWorkspace) {
      fetchProjects(activeWorkspace.id);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    if (!activeWorkspace) return;
    const fetchProfile = async () => {
      try {
        const response = await apiClient.get(`/api/v1/workspaces/${activeWorkspace.id}/profile`);
        if (response.data && response.data.primaryPlatform) {
          setPrimaryPlatform(response.data.primaryPlatform);
        }
      } catch (err) {
        console.error("Failed to load platform metadata:", err);
      }
    };
    fetchProfile();
  }, [activeWorkspace]);

  const selectProjectDetails = (project: ContentProject) => {
    // Cancel any pending autosave first
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSelectedProject(project);
    setEditorTitle(project.title);
    setEditorTopic(project.topic);
    setEditorPrimaryGoal(project.primaryGoal || 'Reach');
    setEditorHook(normalizeBullets(project.hook || ''));
    setEditorScript(normalizeBullets(project.script || ''));
    setEditorCta(normalizeBullets(project.cta || ''));
    setEditorStatus(project.status);
    
    // Store signature to prevent immediate autosave loop on selection
    lastSavedRef.current = JSON.stringify({
      title: project.title,
      topic: project.topic,
      primaryGoal: project.primaryGoal || 'Reach',
      hook: normalizeBullets(project.hook || ''),
      script: normalizeBullets(project.script || ''),
      cta: normalizeBullets(project.cta || ''),
      status: project.status
    });

    setSaveStatus('idle');
    setIsOnboarding(false);
  };

  // Run generation
  const handleGenerate = async () => {
    if (!activeWorkspace) return;
    if (!newTitle.trim()) {
      addToast("Please enter a title for your project", "error");
      return;
    }
    if (!newTopic.trim()) {
      addToast("Please enter a topic description", "error");
      return;
    }

    setGenerating(true);
    setGenerationStep(0);

    const stepInterval = setInterval(() => {
      setGenerationStep((prev) => {
        if (prev < generationSteps.length - 1) return prev + 1;
        clearInterval(stepInterval);
        return prev;
      });
    }, 800);

    try {
      const response = await apiClient.post(`/api/v1/workspaces/${activeWorkspace.id}/content`, {
        title: newTitle,
        topic: newTopic,
        primaryGoal: newPrimaryGoal
      });

      clearInterval(stepInterval);
      setGenerationStep(4);
      await new Promise(r => setTimeout(r, 400));

      if (response.data) {
        const created: ContentProject = response.data;
        addToast("Draft generated successfully!", "success");
        setNewTitle('');
        setNewTopic('');
        setIsOnboarding(false);
        // Refresh project list and select newly created project
        await fetchProjects(activeWorkspace.id, created.projectId);
      }
    } catch (err: any) {
      console.error(err);
      addToast(err.response?.data?.message || "Failed to generate script draft. Try setting up your profile first.", "error");
    } finally {
      setGenerating(false);
    }
  };

  // Perform Autosave
  const triggerAutosave = () => {
    if (!activeWorkspace || !selectedProject) return;

    const currentDraft = {
      title: editorTitle,
      topic: editorTopic,
      primaryGoal: editorPrimaryGoal,
      hook: editorHook,
      script: editorScript,
      cta: editorCta,
      status: editorStatus
    };

    const draftString = JSON.stringify(currentDraft);
    if (draftString === lastSavedRef.current) {
      return; // No changes since last save
    }

    setSaveStatus('saving');

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await apiClient.put(
          `/api/v1/workspaces/${activeWorkspace.id}/content/${selectedProject.projectId}`,
          currentDraft
        );

        if (response.data) {
          lastSavedRef.current = draftString;
          setSaveStatus('saved');
          // Update the list entry in memory without full refresh to avoid input stutter
          setProjects((prev) =>
            prev.map((p) =>
              p.projectId === selectedProject.projectId
                ? { ...p, ...response.data }
                : p
            )
          );
        }
      } catch (err) {
        console.error("Autosave failed:", err);
        setSaveStatus('error');
      }
    }, 1000); // 1s debounce
  };

  // Watch for changes to editor fields to trigger debounced autosave
  useEffect(() => {
    if (selectedProject) {
      triggerAutosave();
    }
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [editorTitle, editorTopic, editorPrimaryGoal, editorHook, editorScript, editorCta, editorStatus]);

  // Actions
  const handleRegenerate = async () => {
    if (!activeWorkspace || !selectedProject) return;
    setGenerating(true);
    setGenerationStep(2); // Start at hook synthesis step

    try {
      const response = await apiClient.post(
        `/api/v1/workspaces/${activeWorkspace.id}/content/${selectedProject.projectId}/regenerate`
      );

      if (response.data) {
        addToast("Draft regenerated successfully!", "success");
        selectProjectDetails(response.data);
        // Refresh project list entry
        setProjects((prev) =>
          prev.map((p) => (p.projectId === selectedProject.projectId ? response.data : p))
        );
      }
    } catch (err: any) {
      console.error(err);
      addToast("Failed to regenerate drafts.", "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleDuplicate = async () => {
    if (!activeWorkspace || !selectedProject) return;
    try {
      const response = await apiClient.post(
        `/api/v1/workspaces/${activeWorkspace.id}/content/${selectedProject.projectId}/duplicate`
      );

      if (response.data) {
        const cloned: ContentProject = response.data;
        addToast("Duplicate copy created!", "success");
        await fetchProjects(activeWorkspace.id, cloned.projectId);
      }
    } catch (err) {
      console.error(err);
      addToast("Failed to duplicate draft.", "error");
    }
  };

  const handleDelete = async () => {
    if (!activeWorkspace || !selectedProject) return;
    if (!confirm(`Are you sure you want to delete "${selectedProject.title}"?`)) return;

    try {
      await apiClient.delete(
        `/api/v1/workspaces/${activeWorkspace.id}/content/${selectedProject.projectId}`
      );
      addToast("Project deleted", "info");
      
      const remaining = projects.filter((p) => p.projectId !== selectedProject.projectId);
      setProjects(remaining);
      if (remaining.length > 0) {
        selectProjectDetails(remaining[0]);
      } else {
        setSelectedProject(null);
        setIsOnboarding(true);
      }
    } catch (err) {
      console.error(err);
      addToast("Failed to delete project.", "error");
    }
  };

  const handleRepurpose = async () => {
    if (!activeWorkspace) return;
    if (!repurposeContentText.trim()) {
      addToast("Please enter original content to repurpose", "error");
      return;
    }

    setRepurposing(true);
    try {
      const response = await apiClient.post(`/api/v1/workspaces/${activeWorkspace.id}/repurpose`, {
        originalContent: repurposeContentText,
        sourceType: repurposeSourceType,
        targetFormat: repurposeTargetFormat
      });

      if (response.data) {
        setRepurposeResult(response.data);
        addToast("Content repurposed successfully!", "success");
      }
    } catch (err: any) {
      console.error(err);
      addToast(err.response?.data?.error || "Failed to repurpose content", "error");
    } finally {
      setRepurposing(false);
    }
  };

  const handleCopySection = (text: string, sectionName: string) => {
    navigator.clipboard.writeText(text);
    addToast(`${sectionName} copied to clipboard!`, "success");
  };

  // Export handlers
  const handleCopyToClipboard = () => {
    if (activeTool === 'repurposer') {
      if (!repurposeResult) return;
      const tags = repurposeResult.suggestedHashtags ? repurposeResult.suggestedHashtags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : '';
      const text = `TITLE: ${repurposeResult.title}\n\nCONTENT:\n${repurposeResult.content}\n\nHASHTAGS:\n${tags}\n\nCTA:\n${repurposeResult.suggestedCTA}`;
      navigator.clipboard.writeText(text);
      addToast("Copied all repurposed content!", "success");
      return;
    }
    if (!selectedProject) return;
    const dateStr = selectedProject ? new Date(selectedProject.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const text = `TITLE: ${editorTitle}\nPLATFORM: ${primaryPlatform || 'YouTube / Instagram'}\nGOAL: ${editorPrimaryGoal || 'Reach'}\nGENERATED: ${dateStr}\n\n--------------------------------\n\nHOOKS\n\n${normalizeBullets(editorHook)}\n\n--------------------------------\n\nSCRIPT\n\n${normalizeBullets(editorScript)}\n\n--------------------------------\n\nCALL TO ACTIONS\n\n${normalizeBullets(editorCta)}`;
    navigator.clipboard.writeText(text);
    addToast("Copied content to clipboard!", "success");
  };

  const handleDownloadTxt = () => {
    if (activeTool === 'repurposer') {
      if (!repurposeResult) return;
      const tags = repurposeResult.suggestedHashtags ? repurposeResult.suggestedHashtags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : '';
      const text = `TITLE: ${repurposeResult.title}\n\nCONTENT:\n${repurposeResult.content}\n\nHASHTAGS:\n${tags}\n\nCTA:\n${repurposeResult.suggestedCTA}`;
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${repurposeResult.title.toLowerCase().replace(/\s+/g, '-')}-repurposed.txt`;
      link.click();
      URL.revokeObjectURL(url);
      addToast("Downloaded repurposed TXT file", "success");
      return;
    }
    if (!selectedProject) return;
    const dateStr = selectedProject ? new Date(selectedProject.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const text = `TITLE: ${editorTitle}\nPLATFORM: ${primaryPlatform || 'YouTube / Instagram'}\nGOAL: ${editorPrimaryGoal || 'Reach'}\nGENERATED: ${dateStr}\n\n--------------------------------\n\nHOOKS\n\n${normalizeBullets(editorHook)}\n\n--------------------------------\n\nSCRIPT\n\n${normalizeBullets(editorScript)}\n\n--------------------------------\n\nCALL TO ACTIONS\n\n${normalizeBullets(editorCta)}`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${editorTitle.toLowerCase().replace(/\s+/g, '-')}-draft.txt`;
    link.click();
    URL.revokeObjectURL(url);
    addToast("Downloaded TXT draft", "success");
  };

  const handleDownloadMarkdown = () => {
    if (activeTool === 'repurposer') {
      if (!repurposeResult) return;
      const tags = repurposeResult.suggestedHashtags ? repurposeResult.suggestedHashtags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : '';
      const markdown = `# ${repurposeResult.title}\n\n**Format:** ${TARGET_FORMAT_LABELS[repurposeTargetFormat]}\n**Source:** ${repurposeSourceType}\n\n---\n\n## Content\n\n${repurposeResult.content}\n\n---\n\n## Hashtags\n\n${tags}\n\n---\n\n## CTA\n\n${repurposeResult.suggestedCTA}`;
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${repurposeResult.title.toLowerCase().replace(/\s+/g, '-')}-repurposed.md`;
      link.click();
      URL.revokeObjectURL(url);
      addToast("Downloaded repurposed Markdown file", "success");
      return;
    }
    if (!selectedProject) return;
    const dateStr = selectedProject ? new Date(selectedProject.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const markdown = `# ${editorTitle}\n\n**Platform:** ${primaryPlatform || 'YouTube / Instagram'}\n**Goal:** ${editorPrimaryGoal || 'Reach'}\n**Generated:** ${dateStr}\n\n---\n\n## Hooks\n\n${normalizeBullets(editorHook)}\n\n---\n\n## Script\n\n${normalizeBullets(editorScript)}\n\n---\n\n## Call To Actions\n\n${normalizeBullets(editorCta)}`;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${editorTitle.toLowerCase().replace(/\s+/g, '-')}-draft.md`;
    link.click();
    URL.revokeObjectURL(url);
    addToast("Downloaded Markdown draft", "success");
  };

  const handleDownloadPdf = async () => {
    if (activeTool === 'repurposer') {
      if (!repurposeResult) return;
      try {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF();
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        const cleanTitle = stripMarkdown(repurposeResult.title || 'Repurposed Content');
        const splitTitle = doc.splitTextToSize(cleanTitle, 170);
        let y = 25;
        for (let line of splitTitle) {
          doc.text(line, 20, y);
          y += 10;
        }
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Format: ${TARGET_FORMAT_LABELS[repurposeTargetFormat]}   |   Source: ${repurposeSourceType}`, 20, y);
        y += 5;
        
        doc.setDrawColor(200);
        doc.setLineWidth(0.5);
        doc.line(20, y, 190, y);
        y += 12;
        
        const addSection = (header: string, content: string) => {
          const contentNorm = stripMarkdown(content);
          if (y > 265) {
            doc.addPage();
            y = 25;
          }
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.setTextColor(0);
          doc.text(header.toUpperCase(), 20, y);
          y += 8;
          
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(50);
          
          const splitText = doc.splitTextToSize(contentNorm, 170);
          for (let line of splitText) {
            if (y > 275) {
              doc.addPage();
              y = 25;
            }
            doc.text(line, 20, y);
            y += 6;
          }
          y += 10;
        };
        
        if (repurposeResult.content) {
          addSection('Content', repurposeResult.content);
        }
        if (repurposeResult.suggestedHashtags && repurposeResult.suggestedHashtags.length > 0) {
          addSection('Hashtags', repurposeResult.suggestedHashtags.join(' '));
        }
        if (repurposeResult.suggestedCTA) {
          addSection('Suggested CTA', repurposeResult.suggestedCTA);
        }
        
        doc.save(`${cleanTitle.toLowerCase().replace(/\s+/g, '-')}-repurposed.pdf`);
        addToast("Downloaded repurposed PDF", "success");
      } catch (err) {
        console.error("Failed to generate PDF:", err);
        addToast("Failed to export as PDF", "error");
      }
      return;
    }

    if (!selectedProject) return;
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      
      const title = editorTitle || 'Untitled Project';
      const dateStr = selectedProject ? new Date(selectedProject.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      
      // Page Setup: Title Wrapping
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      
      const cleanTitle = stripMarkdown(title);
      const splitTitle = doc.splitTextToSize(cleanTitle, 170);
      let y = 25;
      for (let line of splitTitle) {
        doc.text(line, 20, y);
        y += 10;
      }
      
      // Metadata
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Platform: ${primaryPlatform || 'YouTube / Instagram'}   |   Goal: ${editorPrimaryGoal || 'Reach'}   |   Generated: ${dateStr}`, 20, y);
      y += 5;
      
      // Divider Line
      doc.setDrawColor(200);
      doc.setLineWidth(0.5);
      doc.line(20, y, 190, y);
      y += 12;
      
      const addSection = (header: string, content: string) => {
        const contentNorm = stripMarkdown(normalizeBullets(content));
        
        // Page break check for Section Header
        if (y > 265) {
          doc.addPage();
          y = 25;
        }
        
        // Section Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(header.toUpperCase(), 20, y);
        y += 8;
        
        // Section Content
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(50);
        
        const splitText = doc.splitTextToSize(contentNorm, 170);
        for (let line of splitText) {
          if (y > 275) {
            doc.addPage();
            y = 25;
          }
          doc.text(line, 20, y);
          y += 6;
        }
        y += 10; // Extra spacing after section
      };
      
      if (editorHook) {
        addSection('Hooks', editorHook);
      }
      if (editorScript) {
        addSection('Script', editorScript);
      }
      if (editorCta) {
        addSection('Call To Actions', editorCta);
      }
      
      doc.save(`${title.toLowerCase().replace(/\s+/g, '-')}-draft.pdf`);
      addToast("Downloaded PDF draft", "success");
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      addToast("Failed to export as PDF", "error");
    }
  };

  // Helper groupings and sorting
  const getFilteredAndSortedProjects = () => {
    return projects
      .filter((p) => {
        const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.topic.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = filterStatus === 'ALL' || p.status === filterStatus;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        if (sortBy === 'alphabetical') {
          return a.title.localeCompare(b.title);
        }
        return 0;
      });
  };

  // Analytics helper calculations
  const calculateAnalytics = () => {
    const total = projects.length;
    
    // Created this week (within 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const createdThisWeek = projects.filter(p => new Date(p.createdAt) >= sevenDaysAgo).length;

    // Average topic length
    const totalTopicLength = projects.reduce((sum, p) => sum + p.topic.length, 0);
    const avgTopicLength = total > 0 ? Math.round(totalTopicLength / total) : 0;

    return { total, createdThisWeek, avgTopicLength };
  };

  const analytics = calculateAnalytics();

  // Group by Date for Sidebar display
  const groupProjects = (projectList: ContentProject[]) => {
    const today: ContentProject[] = [];
    const last7Days: ContentProject[] = [];
    const older: ContentProject[] = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;

    projectList.forEach((p) => {
      const time = new Date(p.createdAt).getTime();
      if (time >= startOfToday) {
        today.push(p);
      } else if (time >= sevenDaysAgo) {
        last7Days.push(p);
      } else {
        older.push(p);
      }
    });

    return { today, last7Days, older };
  };

  const filteredProjects = getFilteredAndSortedProjects();
  const groupedProjects = groupProjects(filteredProjects);

  // Hook & CTA Variants
  const hookVariants = selectedProject?.variants.filter(v => v.variantType === 'HOOK') || [];
  const ctaVariants = selectedProject?.variants.filter(v => v.variantType === 'CTA') || [];

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

      {/* Mode Selector Toggle */}
      <div className="flex bg-[#0a0a0c]/60 border border-white/5 rounded-xl p-1 self-start flex-shrink-0">
        <button
          onClick={() => setActiveTool('scriptwriter')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeTool === 'scriptwriter' 
              ? 'bg-gradient-to-r from-[#a1461c] to-[#dd6b20] text-white shadow-md' 
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Video className="h-4 w-4" />
          <span>Scriptwriter</span>
        </button>
        <button
          onClick={() => setActiveTool('repurposer')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeTool === 'repurposer' 
              ? 'bg-gradient-to-r from-[#a1461c] to-[#dd6b20] text-white shadow-md' 
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Wand2 className="h-4 w-4" />
          <span>Content Repurposer</span>
        </button>
      </div>

      {activeTool === 'scriptwriter' ? (
        /* Main Studio Body Grid */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full items-stretch">

        {/* LEFT COLUMN: Sidebar list + Metrics cards (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6 h-full overflow-hidden">
          
          {/* Analytics Summary Cards (Inline Grid) */}
          <div className="grid grid-cols-2 gap-3 flex-shrink-0">
            <div className="glass-card rounded-xl p-3.5 border border-white/5 space-y-1 bg-white/[0.01]">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Total Drafts</span>
              <p className="text-xl font-black text-white">{analytics.total}</p>
            </div>
            <div className="glass-card rounded-xl p-3.5 border border-white/5 space-y-1 bg-white/[0.01]">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Created This Week</span>
              <p className="text-xl font-black text-cyan-400">+{analytics.createdThisWeek}</p>
            </div>
            <div className="glass-card rounded-xl p-3.5 border border-white/5 space-y-1 bg-white/[0.01]">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Avg Topic Len</span>
              <p className="text-xl font-black text-indigo-400">{analytics.avgTopicLength} ch</p>
            </div>
            <div className="glass-card rounded-xl p-3.5 border border-white/5 space-y-1 bg-white/[0.01] overflow-hidden">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Active Brand</span>
              <p className="text-xs font-bold text-emerald-400 truncate mt-1">
                {activeWorkspace?.name || 'None'}
              </p>
            </div>
          </div>

          {/* Project List Sidebar Panel */}
          <div className="glass-card rounded-2xl border border-white/5 flex flex-col flex-1 overflow-hidden bg-card/10">
            
            {/* Header + Search/Filters */}
            <div className="p-4 border-b border-white/5 space-y-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Project Library</span>
                <button
                  onClick={() => setIsOnboarding(true)}
                  className="flex items-center gap-1 text-[10px] text-cyan-400 bg-cyan-400/10 hover:bg-cyan-400/20 px-2.5 py-1 rounded-lg font-bold uppercase transition-all"
                >
                  <Plus className="h-3 w-3" />
                  <span>Create New</span>
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search drafts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0a0a0c]/60 border border-white/[0.06] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/30 transition-all"
                />
              </div>

              {/* Filters */}
              <div className="flex gap-2 text-[10px]">
                <div className="flex-1 flex items-center bg-[#0a0a0c]/40 border border-white/[0.04] rounded-lg px-2 py-1">
                  <Filter className="h-3 w-3 text-zinc-500 mr-1.5" />
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="bg-transparent text-zinc-400 hover:text-white cursor-pointer w-full focus:outline-none"
                  >
                    <option value="ALL">All</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="SCHEDULED">SCHEDULED</option>
                  </select>
                </div>

                <div className="flex-1 flex items-center bg-[#0a0a0c]/40 border border-white/[0.04] rounded-lg px-2 py-1">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-transparent text-zinc-400 hover:text-white cursor-pointer w-full focus:outline-none"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="alphabetical">Alphabetical</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Scrollable list container */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
              {loadingProjects ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
                  <span className="text-[10px] text-zinc-500">Loading library...</span>
                </div>
              ) : projects.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Wand2 className="h-8 w-8 text-zinc-600 mx-auto opacity-50" />
                  <p className="text-xs text-zinc-500">No project drafts found</p>
                </div>
              ) : (
                <>
                  {/* TODAY */}
                  {groupedProjects.today.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-2">Today</h4>
                      {groupedProjects.today.map((p) => (
                        <button
                          key={p.projectId}
                          onClick={() => selectProjectDetails(p)}
                          className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between ${
                            selectedProject?.projectId === p.projectId
                              ? 'bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border-cyan-500/20 text-cyan-400'
                              : 'bg-white/[0.01] hover:bg-white/[0.03] border-white/[0.03] text-zinc-400 hover:text-white'
                          }`}
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <p className="text-xs font-semibold truncate text-white">{p.title}</p>
                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">{p.topic}</p>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* LAST 7 DAYS */}
                  {groupedProjects.last7Days.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-2">Last 7 Days</h4>
                      {groupedProjects.last7Days.map((p) => (
                        <button
                          key={p.projectId}
                          onClick={() => selectProjectDetails(p)}
                          className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between ${
                            selectedProject?.projectId === p.projectId
                              ? 'bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border-cyan-500/20 text-cyan-400'
                              : 'bg-white/[0.01] hover:bg-white/[0.03] border-white/[0.03] text-zinc-400 hover:text-white'
                          }`}
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <p className="text-xs font-semibold truncate text-white">{p.title}</p>
                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">{p.topic}</p>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* OLDER */}
                  {groupedProjects.older.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-2">Older</h4>
                      {groupedProjects.older.map((p) => (
                        <button
                          key={p.projectId}
                          onClick={() => selectProjectDetails(p)}
                          className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between ${
                            selectedProject?.projectId === p.projectId
                              ? 'bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border-cyan-500/20 text-cyan-400'
                              : 'bg-white/[0.01] hover:bg-white/[0.03] border-white/[0.03] text-zinc-400 hover:text-white'
                          }`}
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <p className="text-xs font-semibold truncate text-white">{p.title}</p>
                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">{p.topic}</p>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Studio Canvas or Onboarding Input (8 cols) */}
        <div className="lg:col-span-8 flex flex-col h-full overflow-hidden">
          
          <AnimatePresence mode="wait">
            
            {/* ONBOARDING STATE */}
            {isOnboarding ? (
              <motion.div
                key="onboarding"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="glass-card rounded-2xl border border-white/5 p-8 flex flex-col justify-center items-center h-full text-center space-y-6 bg-card/5 relative overflow-hidden"
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute top-1/3 left-1/4 w-60 h-60 bg-indigo-500/5 rounded-full blur-[90px] pointer-events-none" />

                <div className="space-y-2 max-w-md">
                  <div className="h-12 w-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400 mx-auto shadow-lg shadow-cyan-500/5">
                    <Wand2 className="h-6 w-6" />
                  </div>
                  <h2 className="text-xl font-extrabold text-white mt-4">Create your first content idea</h2>
                  <p className="text-xs text-zinc-400">
                    Enter a creative direction or video idea. Our engine seeds deterministic creator content templates tailored to your brand voice.
                  </p>
                </div>

                <div className="space-y-4 w-full max-w-lg text-left bg-[#0c0c0e]/40 p-6 rounded-2xl border border-white/5 backdrop-blur-md">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Project Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Next.js 16 Upgrade Guide"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full bg-[#0a0a0c]/60 border border-white/[0.08] rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/30 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Primary Goal</label>
                    <select
                      value={newPrimaryGoal}
                      onChange={(e) => setNewPrimaryGoal(e.target.value)}
                      className="w-full bg-[#0a0a0c]/60 border border-white/[0.08] rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-cyan-500/30 transition-all cursor-pointer"
                    >
                      <option value="Reach">Reach</option>
                      <option value="Brand Awareness">Brand Awareness</option>
                      <option value="Engagement">Engagement</option>
                      <option value="Lead Generation">Lead Generation</option>
                      <option value="Sales / Conversion">Sales / Conversion</option>
                      <option value="Community Building">Community Building</option>
                      <option value="Authority Building">Authority Building</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Concept / Topic Details</label>
                    <textarea
                      placeholder="e.g. 3 reasons developers should upgrade to Next.js 16 compiler features in 30 seconds"
                      value={newTopic}
                      onChange={(e) => setNewTopic(e.target.value)}
                      rows={4}
                      className="w-full bg-[#0a0a0c]/60 border border-white/[0.08] rounded-xl p-4 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/30 transition-all resize-none"
                    />
                  </div>

                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="w-full glow-btn bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-bold rounded-xl py-3.5 text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                        <span>Generating Draft...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        <span>Generate Complete Script Draft</span>
                      </>
                    )}
                  </button>
                </div>

                {generating && (
                  <div className="w-full max-w-lg mt-4 bg-zinc-900/60 border border-white/5 rounded-xl p-3 flex items-center gap-3">
                    <Loader2 className="h-4 w-4 text-cyan-400 animate-spin flex-shrink-0" />
                    <span className="text-[11px] text-zinc-400 font-mono animate-pulse">
                      {generationSteps[generationStep]}
                    </span>
                  </div>
                )}

              </motion.div>
            ) : (
              
              /* ACTIVE STUDIO EDITOR CANVAS */
              <motion.div
                key="studio"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="flex flex-col h-full overflow-hidden space-y-4"
              >
                
                {/* TOP ACTION BAR */}
                <div className="glass-card rounded-2xl border border-white/5 p-4 flex flex-col md:flex-row justify-between items-center gap-3 bg-card/10 flex-shrink-0">
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <FileText className="h-5 w-5 text-indigo-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <textarea
                          ref={titleTextareaRef}
                          rows={1}
                          value={editorTitle}
                          onChange={(e) => setEditorTitle(e.target.value)}
                          className="bg-transparent border-b border-transparent hover:border-white/20 focus:border-cyan-500 focus:outline-none text-sm font-black text-white w-full py-0.5 transition-all resize-none overflow-hidden leading-snug"
                          placeholder="Untitled Project"
                        />
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-mono">
                            Status:
                          </span>
                          <select
                            value={editorStatus}
                            onChange={(e) => setEditorStatus(e.target.value)}
                            className="bg-transparent text-[9px] text-zinc-400 hover:text-white font-bold cursor-pointer focus:outline-none"
                          >
                            <option value="DRAFT">DRAFT</option>
                            <option value="COMPLETED">COMPLETED</option>
                            <option value="SCHEDULED">SCHEDULED</option>
                          </select>
                          <span className="text-zinc-600">•</span>
                          <span className="text-[9px] text-zinc-500">
                            {saveStatus === 'saving' && <span className="text-amber-400 animate-pulse">Saving...</span>}
                            {saveStatus === 'saved' && <span className="text-emerald-400">All changes saved</span>}
                            {saveStatus === 'error' && <span className="text-rose-400">Save error!</span>}
                            {saveStatus === 'idle' && <span className="text-zinc-500">Synced</span>}
                          </span>
                        </div>
                      </div>
                      <div className="flex bg-[#0a0a0c]/60 border border-white/5 rounded-lg p-0.5 flex-shrink-0 self-start sm:self-center">
                        <button
                          onClick={() => setEditorTab('edit')}
                          className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                            editorTab === 'edit' ? 'bg-cyan-500 text-white' : 'text-zinc-500 hover:text-white'
                          }`}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setEditorTab('preview')}
                          className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                            editorTab === 'preview' ? 'bg-cyan-500 text-white' : 'text-zinc-500 hover:text-white'
                          }`}
                        >
                          Preview
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Actions buttons row */}
                  <div className="flex items-center gap-2 self-stretch md:self-auto justify-between md:justify-end">
                    
                    <button
                      onClick={handleRegenerate}
                      disabled={generating}
                      className="p-2 text-zinc-400 hover:text-white rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all cursor-pointer flex items-center justify-center"
                      title="Regenerate all draft scripts"
                    >
                      <Wand2 className="h-4 w-4" />
                    </button>

                    <button
                      onClick={handleDuplicate}
                      className="p-2 text-zinc-400 hover:text-white rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all cursor-pointer flex items-center justify-center"
                      title="Duplicate project"
                    >
                      <Copy className="h-4 w-4" />
                    </button>

                    {/* Export Dropdown in one line */}
                    <div className="relative" ref={dropdownRef}>
                      <button
                        onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-cyan-400 bg-cyan-400/10 hover:bg-cyan-400/20 rounded-xl transition-all cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        <span>Export</span>
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      {exportDropdownOpen && (
                        <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-card border border-border p-1 shadow-2xl z-50">
                          <button
                            onClick={() => {
                              handleCopyToClipboard();
                              setExportDropdownOpen(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted rounded-lg text-left transition-all cursor-pointer"
                          >
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Copy to Clipboard</span>
                          </button>
                          <button
                            onClick={() => {
                              handleDownloadTxt();
                              setExportDropdownOpen(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted rounded-lg text-left transition-all cursor-pointer"
                          >
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Download TXT</span>
                          </button>
                          <button
                            onClick={() => {
                              handleDownloadMarkdown();
                              setExportDropdownOpen(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted rounded-lg text-left transition-all cursor-pointer"
                          >
                            <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Download Markdown</span>
                          </button>
                          <button
                            onClick={() => {
                              handleDownloadPdf();
                              setExportDropdownOpen(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted rounded-lg text-left transition-all cursor-pointer"
                          >
                            <FileDown className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Export as PDF</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleDelete}
                      className="p-2 text-rose-500 hover:text-rose-400 rounded-xl bg-rose-500/5 border border-rose-500/10 hover:border-rose-500/20 transition-all cursor-pointer flex items-center justify-center"
                      title="Delete draft"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* MAIN RICH EDITOR CANVAS AREA */}
                {editorTab === 'edit' ? (
                  <div className="flex-1 overflow-y-auto space-y-5 pr-2 custom-scrollbar">
                  
                  {/* Topic section */}
                  <div className="space-y-3">
                    <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
                      <div className="flex-1 space-y-1.5">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Topic Idea Details</span>
                        <textarea
                          value={editorTopic}
                          onChange={(e) => setEditorTopic(e.target.value)}
                          rows={2}
                          className="w-full bg-[#0a0a0c]/60 border border-white/[0.04] rounded-xl p-3 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/30 transition-all resize-none font-medium leading-relaxed"
                          placeholder="Specify your draft details..."
                        />
                      </div>
                      <div className="w-full md:w-48 space-y-1.5 flex-shrink-0">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Primary Goal</span>
                        <select
                          value={editorPrimaryGoal}
                          onChange={(e) => setEditorPrimaryGoal(e.target.value)}
                          className="w-full bg-[#0a0a0c]/60 border border-white/[0.04] rounded-xl p-3.5 text-xs text-zinc-300 focus:outline-none focus:border-cyan-500/30 transition-all cursor-pointer"
                        >
                          <option value="Reach">Reach</option>
                          <option value="Brand Awareness">Brand Awareness</option>
                          <option value="Engagement">Engagement</option>
                          <option value="Lead Generation">Lead Generation</option>
                          <option value="Sales / Conversion">Sales / Conversion</option>
                          <option value="Community Building">Community Building</option>
                          <option value="Authority Building">Authority Building</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Hook Editor + Variants Panel */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Hook Section</span>
                      
                      {/* Hook variants quick select tabs */}
                      {hookVariants.length > 0 && (
                        <div className="flex gap-1.5 bg-[#0a0a0c]/50 p-1 rounded-lg border border-white/[0.04]">
                          {hookVariants.map((hv, idx) => (
                            <button
                              key={hv.id}
                              onClick={() => {
                                setEditorHook(hv.content);
                                addToast(`Swapped to hook variant ${idx + 1}`, "info");
                              }}
                              className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition-all ${
                                editorHook === hv.content
                                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]'
                              }`}
                            >
                              V{idx + 1}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <textarea
                      value={editorHook}
                      onChange={(e) => setEditorHook(e.target.value)}
                      onBlur={(e) => setEditorHook(normalizeBullets(e.target.value))}
                      rows={3}
                      className="w-full bg-[#0a0a0c]/60 border border-white/[0.04] rounded-xl p-4.5 text-xs text-zinc-300 font-mono leading-relaxed focus:outline-none focus:border-cyan-500/30 transition-all resize-none border-l-2 border-l-cyan-500"
                      placeholder="Generated hook variant content..."
                    />
                  </div>

                  {/* Script Text Body Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Full Script / Body Layout</span>
                      <span className="text-[10px] text-zinc-500 font-mono">{editorScript.length} characters</span>
                    </div>
                    <div className="relative">
                      <textarea
                        value={editorScript}
                        onChange={(e) => setEditorScript(e.target.value)}
                        onBlur={(e) => setEditorScript(normalizeBullets(e.target.value))}
                        className="w-full h-72 bg-[#0a0a0c]/60 border border-white/[0.04] rounded-xl p-5 text-xs text-zinc-300 font-mono leading-relaxed focus:outline-none focus:border-indigo-500/30 transition-all resize-none"
                        placeholder="Core script explanation content body..."
                      />
                      {generating && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] rounded-xl flex flex-col items-center justify-center gap-2">
                          <Loader2 className="h-6 w-6 text-cyan-400 animate-spin" />
                          <span className="text-[11px] text-zinc-400 font-mono animate-pulse">
                            {generationSteps[generationStep]}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CTA Section + Variants Panel */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Call To Action (CTA)</span>
                      
                      {/* CTA variants quick select tabs */}
                      {ctaVariants.length > 0 && (
                        <div className="flex gap-1.5 bg-[#0a0a0c]/50 p-1 rounded-lg border border-white/[0.04]">
                          {ctaVariants.map((cv, idx) => (
                            <button
                              key={cv.id}
                              onClick={() => {
                                setEditorCta(cv.content);
                                addToast(`Swapped to CTA variant ${idx + 1}`, "info");
                              }}
                              className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition-all ${
                                editorCta === cv.content
                                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]'
                              }`}
                            >
                              V{idx + 1}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <textarea
                      value={editorCta}
                      onChange={(e) => setEditorCta(e.target.value)}
                      onBlur={(e) => setEditorCta(normalizeBullets(e.target.value))}
                      rows={3}
                      className="w-full bg-[#0a0a0c]/60 border border-white/[0.04] rounded-xl p-4.5 text-xs text-zinc-300 font-mono leading-relaxed focus:outline-none focus:border-cyan-500/30 transition-all resize-none border-l-2 border-l-indigo-500"
                      placeholder="CTA text variant content..."
                    />
                  </div>

                </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar bg-[#070709]/60 rounded-2xl border border-white/5 p-8 max-w-3xl mx-auto w-full">
                    <div className="space-y-2 text-center pb-6 border-b border-white/5">
                      <h1 className="text-2xl font-black text-white">{editorTitle || 'Untitled Project'}</h1>
                      <div className="flex items-center justify-center gap-4 text-[10px] text-zinc-500 uppercase tracking-widest font-mono">
                        <span>Platform: {primaryPlatform || 'YouTube / Instagram'}</span>
                        <span>•</span>
                        <span>Goal: {editorPrimaryGoal || 'Reach'}</span>
                        <span>•</span>
                        <span>Date: {selectedProject ? new Date(selectedProject.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
                      </div>
                    </div>

                    {/* HOOK Section */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono">Hooks</h3>
                      <div className="p-5 rounded-xl bg-white/[0.01] border-l-2 border-l-cyan-500 border border-white/5 text-sm leading-relaxed text-zinc-300">
                        {renderFormattedText(normalizeBullets(editorHook)) || <span className="italic text-zinc-600">No hook content generated.</span>}
                      </div>
                    </div>

                    {/* SCRIPT Section */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono">Script</h3>
                      <div className="p-5 rounded-xl bg-white/[0.01] border-l-2 border-l-indigo-500 border border-white/5 text-sm leading-relaxed text-zinc-300">
                        {renderFormattedText(normalizeBullets(editorScript)) || <span className="italic text-zinc-600">No script content generated.</span>}
                      </div>
                    </div>

                    {/* CTA Section */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider font-mono">Call To Actions</h3>
                      <div className="p-5 rounded-xl bg-white/[0.01] border-l-2 border-l-purple-500 border border-white/5 text-sm leading-relaxed text-zinc-300">
                        {renderFormattedText(normalizeBullets(editorCta)) || <span className="italic text-zinc-600">No CTA content generated.</span>}
                      </div>
                    </div>
                  </div>
                )}

              </motion.div>
            )}

          </AnimatePresence>

        </div>
      </div>
      ) : (
        /* Content Repurposer Tool Grid */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full items-stretch w-full">
          {/* Form Input Side */}
          <div className="lg:col-span-5 flex flex-col h-full overflow-hidden">
            <div className="glass-card rounded-2xl border border-white/5 p-6 flex flex-col space-y-4 bg-card/10 h-full overflow-y-auto custom-scrollbar">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Repurpose Content</h3>
                <p className="text-[10px] text-zinc-500">Repackage scripts, articles, or posts into optimized target formats instantly.</p>
              </div>

              <div className="space-y-1.5 flex-1 flex flex-col">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex-shrink-0">Original Content</label>
                <textarea
                  placeholder="Paste your script, article text, or post content here..."
                  value={repurposeContentText}
                  onChange={(e) => setRepurposeContentText(e.target.value)}
                  className="w-full flex-1 min-h-[250px] bg-[#0a0a0c]/60 border border-white/[0.08] rounded-xl p-4 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/30 transition-all resize-none leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 flex-shrink-0">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Source Type</label>
                  <select
                    value={repurposeSourceType}
                    onChange={(e) => setRepurposeSourceType(e.target.value)}
                    className="w-full bg-[#0a0a0c]/60 border border-white/[0.08] rounded-xl px-3 py-3 text-xs text-white focus:outline-none focus:border-cyan-500/30 transition-all cursor-pointer"
                  >
                    <option value="SCRIPT">SCRIPT</option>
                    <option value="ARTICLE">ARTICLE</option>
                    <option value="POST">POST</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Target Format</label>
                  <select
                    value={repurposeTargetFormat}
                    onChange={(e) => setRepurposeTargetFormat(e.target.value)}
                    className="w-full bg-[#0a0a0c]/60 border border-white/[0.08] rounded-xl px-3 py-3 text-xs text-white focus:outline-none focus:border-cyan-500/30 transition-all cursor-pointer"
                  >
                    {Object.entries(TARGET_FORMAT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleRepurpose}
                disabled={repurposing || !repurposeContentText.trim()}
                className="w-full glow-btn bg-gradient-to-r from-[#a1461c] to-[#dd6b20] hover:from-[#a1461c]/90 hover:to-[#dd6b20]/90 text-white font-bold rounded-xl py-3.5 text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg disabled:opacity-50 flex-shrink-0"
              >
                {repurposing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>Repurposing...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    <span>Repurpose Content</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Outputs Display Side */}
          <div className="lg:col-span-7 flex flex-col h-full overflow-hidden">
            <div className="glass-card rounded-2xl border border-white/5 p-6 flex flex-col bg-card/10 h-full overflow-y-auto custom-scrollbar space-y-5">
              
              {!repurposeResult && !repurposing && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-20">
                  <div className="h-10 w-10 rounded-xl bg-[#a1461c]/10 border border-[#a1461c]/20 flex items-center justify-center text-[#a1461c] shadow-md">
                    <Wand2 className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-bold text-white">No output generated yet</h4>
                  <p className="text-[10px] text-zinc-500 max-w-xs">Fill in your original content and settings to create the repurposed variants.</p>
                </div>
              )}

              {repurposing && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-20">
                  <Loader2 className="h-8 w-8 text-[#a1461c] animate-spin" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-white animate-pulse">Running AI engine...</h4>
                    <p className="text-[10px] text-zinc-500">Formatting content, extracting hooks, and generating CTAs.</p>
                  </div>
                </div>
              )}

              {repurposeResult && !repurposing && (
                <>
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Repurposed Result</span>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyToClipboard}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-zinc-400 hover:text-white rounded-lg transition-all cursor-pointer bg-white/[0.02] border border-white/5 hover:border-white/10 uppercase"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy All</span>
                      </button>

                      {/* Export Dropdown */}
                      <div className="relative" ref={dropdownRef}>
                        <button
                          onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-cyan-400 bg-cyan-400/10 hover:bg-cyan-400/20 rounded-lg transition-all cursor-pointer uppercase"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          <span>Export</span>
                          <ChevronDown className="h-3 w-3" />
                        </button>
                        {exportDropdownOpen && (
                          <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-card border border-border p-1 shadow-2xl z-50">
                            <button
                              onClick={() => {
                                handleCopyToClipboard();
                                setExportDropdownOpen(false);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted rounded-lg text-left transition-all cursor-pointer"
                            >
                              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>Copy to Clipboard</span>
                            </button>
                            <button
                              onClick={() => {
                                handleDownloadTxt();
                                setExportDropdownOpen(false);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted rounded-lg text-left transition-all cursor-pointer"
                            >
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>Download TXT</span>
                            </button>
                            <button
                              onClick={() => {
                                handleDownloadMarkdown();
                                setExportDropdownOpen(false);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted rounded-lg text-left transition-all cursor-pointer"
                            >
                              <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>Download Markdown</span>
                            </button>
                            <button
                              onClick={() => {
                                handleDownloadPdf();
                                setExportDropdownOpen(false);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted rounded-lg text-left transition-all cursor-pointer"
                            >
                              <FileDown className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>Export as PDF</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded">Success</span>
                    </div>
                  </div>

                   {/* Title Section */}
                   {repurposeResult.title && (
                     <div className="space-y-2">
                       <div className="flex items-center justify-between">
                         <span className="text-xs font-bold text-[#dd6b20] uppercase tracking-wider font-mono">Title / Hook Line</span>
                         <button
                           onClick={() => handleCopySection(repurposeResult.title, "Title")}
                           className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white transition-all cursor-pointer"
                         >
                           <Copy className="h-3 w-3" />
                           <span>Copy</span>
                         </button>
                       </div>
                       <div className="p-5 rounded-xl bg-white/[0.01] border-l-2 border-l-[#dd6b20] border border-white/5 text-sm leading-relaxed text-zinc-300 break-words">
                         {repurposeResult.title}
                       </div>
                     </div>
                   )}
 
                   {/* Content Section */}
                   {repurposeResult.content && (
                     <div className="space-y-2">
                       <div className="flex items-center justify-between">
                         <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono">Optimized Content</span>
                         <div className="flex items-center gap-3">
                           <span className="text-[9px] text-zinc-500 font-mono">
                             {repurposeResult.content.trim().split(/\s+/).filter(Boolean).length} words | {repurposeResult.content.length} chars
                           </span>
                           <button
                             onClick={() => handleCopySection(repurposeResult.content, "Content")}
                             className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white transition-all cursor-pointer"
                           >
                             <Copy className="h-3 w-3" />
                             <span>Copy</span>
                           </button>
                         </div>
                       </div>
                       <div className="p-5 rounded-xl bg-white/[0.01] border-l-2 border-l-indigo-500 border border-white/5 text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap select-text break-words">
                         {repurposeResult.content}
                       </div>
                     </div>
                   )}
 
                   {/* Suggested Hashtags */}
                   {repurposeResult.suggestedHashtags && repurposeResult.suggestedHashtags.length > 0 && (
                     <div className="space-y-2">
                       <div className="flex items-center justify-between">
                         <span className="text-xs font-bold text-purple-400 uppercase tracking-wider font-mono">Suggested Hashtags</span>
                         <button
                           onClick={() => handleCopySection(repurposeResult.suggestedHashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' '), "Hashtags")}
                           className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white transition-all cursor-pointer"
                         >
                           <Copy className="h-3 w-3" />
                           <span>Copy</span>
                         </button>
                       </div>
                       <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-white/[0.01] border border-white/5">
                         {repurposeResult.suggestedHashtags.map((tag, idx) => {
                           const formattedTag = tag.startsWith('#') ? tag : `#${tag}`;
                           return (
                             <span key={idx} className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded-md">
                               {formattedTag}
                             </span>
                           );
                         })}
                       </div>
                     </div>
                   )}
 
                   {/* Suggested CTA */}
                   {repurposeResult.suggestedCTA && (
                     <div className="space-y-2">
                       <div className="flex items-center justify-between">
                         <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">Suggested CTA</span>
                         <button
                           onClick={() => handleCopySection(repurposeResult.suggestedCTA, "Call-to-Action")}
                           className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white transition-all cursor-pointer"
                         >
                           <Copy className="h-3 w-3" />
                           <span>Copy</span>
                         </button>
                       </div>
                       <div className="p-5 rounded-xl bg-white/[0.01] border-l-2 border-l-emerald-500 border border-white/5 text-sm leading-relaxed text-zinc-300 break-words">
                         {repurposeResult.suggestedCTA}
                       </div>
                     </div>
                   )}

                </>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
