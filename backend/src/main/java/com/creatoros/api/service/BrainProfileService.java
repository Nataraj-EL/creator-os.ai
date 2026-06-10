package com.creatoros.api.service;

import com.creatoros.api.dto.BrainAnalysisInput;
import com.creatoros.api.dto.BrainAnalysisResult;
import com.creatoros.api.dto.BrainProfileDto;
import com.creatoros.api.dto.BrainProfileSnapshotDto;
import com.creatoros.api.model.*;
import com.creatoros.api.repository.BrainProfileRepository;
import com.creatoros.api.repository.BrainProfileSnapshotRepository;
import com.creatoros.api.repository.KnowledgeDocumentRepository;
import com.creatoros.api.repository.WorkspaceRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class BrainProfileService {

    private static final Logger log = LoggerFactory.getLogger(BrainProfileService.class);

    private final BrainProfileRepository brainProfileRepository;
    private final BrainProfileSnapshotRepository brainProfileSnapshotRepository;
    private final KnowledgeDocumentRepository knowledgeDocumentRepository;
    private final WorkspaceRepository workspaceRepository;
    private final AiProviderRouter aiProviderRouter;

    @Transactional(readOnly = true)
    public BrainProfileDto getProfile(User creator, UUID workspaceId) {
        Workspace workspace = workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        Optional<BrainProfile> profileOpt = brainProfileRepository.findByWorkspaceId(workspaceId);
        
        List<KnowledgeDocument> readyDocs = getReadyDocuments(workspaceId);
        int currentDocCount = readyDocs.size();
        long currentWordCount = readyDocs.stream().mapToLong(d -> d.getWordCount() != null ? d.getWordCount() : 0L).sum();

        if (profileOpt.isEmpty()) {
            // Return empty profile representation with upToDate status
            return BrainProfileDto.builder()
                    .workspaceId(workspaceId)
                    .documentCount(0)
                    .totalWordsAnalyzed(0L)
                    .confidenceScore(0)
                    .upToDate(currentDocCount == 0) // Up to date if no docs exist
                    .build();
        }

        BrainProfile profile = profileOpt.get();
        boolean upToDate = profile.getDocumentCount() == currentDocCount && profile.getTotalWordsAnalyzed() == currentWordCount;

        return mapToDto(profile, upToDate);
    }

    @Transactional
    public BrainProfileDto analyzeWorkspaceKnowledge(User creator, UUID workspaceId) {
        Workspace workspace = workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        List<KnowledgeDocument> readyDocs = getReadyDocuments(workspaceId);
        if (readyDocs.isEmpty()) {
            throw new IllegalStateException("No uploaded documents found to build a Brain Twin. Please upload knowledge documents first.");
        }

        // Concatenate text corpus
        StringBuilder corpusBuilder = new StringBuilder();
        long totalWords = 0;
        for (KnowledgeDocument doc : readyDocs) {
            String text = doc.getExtractedText();
            if (text != null && !text.trim().isEmpty()) {
                corpusBuilder.append("--- DOCUMENT: ").append(doc.getFileName()).append(" ---\n");
                corpusBuilder.append(text).append("\n\n");
                totalWords += doc.getWordCount() != null ? doc.getWordCount() : 0L;
            }
        }

        String corpusText = corpusBuilder.toString().trim();
        if (corpusText.isEmpty()) {
            throw new IllegalStateException("Uploaded documents do not contain any extractable text content.");
        }

        // Call AI routing layer to analyze the corpus
        BrainAnalysisInput input = BrainAnalysisInput.builder()
                .workspaceId(workspaceId)
                .knowledgeText(corpusText)
                .build();

        log.info("[Brain Twin] Compiling knowledge brain analysis for workspace: {}", workspaceId);
        BrainAnalysisResult result = aiProviderRouter.executeWithFallback(
                AiTaskType.BRAIN_ANALYSIS,
                input,
                BrainAnalysisResult.class
        );

        Optional<BrainProfile> existingOpt = brainProfileRepository.findByWorkspaceId(workspaceId);
        BrainProfile profile;
        int nextVersion = 1;

        if (existingOpt.isPresent()) {
            profile = existingOpt.get();
            // Find current snapshots size to determine next version
            List<BrainProfileSnapshot> snapshots = brainProfileSnapshotRepository.findByWorkspaceIdOrderByVersionDesc(workspaceId);
            if (!snapshots.isEmpty()) {
                nextVersion = snapshots.get(0).getVersion() + 1;
            } else {
                nextVersion = 2; // version 1 is what the current state was before this snapshot
            }

            // Capture snapshot of current state before updating
            BrainProfileSnapshot snapshot = BrainProfileSnapshot.builder()
                    .workspace(workspace)
                    .version(nextVersion - 1)
                    .creatorIdentity(profile.getCreatorIdentity())
                    .audienceProfile(profile.getAudienceProfile())
                    .communicationStyle(profile.getCommunicationStyle())
                    .writingStyle(profile.getWritingStyle())
                    .niche(profile.getNiche())
                    .contentPillars(profile.getContentPillars())
                    .longTermGoals(profile.getLongTermGoals())
                    .extractedCreatorDNA(profile.getExtractedCreatorDNA())
                    .build();
            brainProfileSnapshotRepository.save(snapshot);

        } else {
            profile = BrainProfile.builder().workspace(workspace).build();
        }

        // Update active profile values
        profile.setCreatorIdentity(result.getCreatorIdentity());
        profile.setCreatorMission(result.getCreatorMission());
        profile.setCreatorVision(result.getCreatorVision());
        profile.setAudienceProfile(result.getAudienceProfile());
        profile.setCommunicationStyle(result.getCommunicationStyle());
        profile.setWritingStyle(result.getWritingStyle());
        profile.setContentStyle(result.getContentStyle());
        profile.setPreferredCTAStyle(result.getPreferredCTAStyle());
        profile.setNiche(result.getNiche());
        profile.setStrategicFocus(result.getStrategicFocus());
        profile.setPersonalityTraits(result.getPersonalityTraits());
        profile.setContentPillars(result.getContentPillars());
        profile.setExpertiseAreas(result.getExpertiseAreas());
        profile.setLongTermGoals(result.getLongTermGoals());
        profile.setExtractedCreatorDNA(result.getCreatorDNA());
        profile.setContentExamples(result.getContentExamples());
        profile.setDocumentCount(readyDocs.size());
        profile.setTotalWordsAnalyzed(totalWords);
        profile.setUpdatedAt(Instant.now());

        BrainProfile saved = brainProfileRepository.save(profile);
        return mapToDto(saved, true);
    }

    @Transactional(readOnly = true)
    public List<BrainProfileSnapshotDto> getSnapshots(User creator, UUID workspaceId) {
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        return brainProfileSnapshotRepository.findByWorkspaceIdOrderByVersionDesc(workspaceId).stream()
                .map(this::mapSnapshotToDto)
                .collect(Collectors.toList());
    }

    private List<KnowledgeDocument> getReadyDocuments(UUID workspaceId) {
        return knowledgeDocumentRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId).stream()
                .filter(d -> d.getStatus() == KnowledgeStatus.READY && !d.isDeleted())
                .collect(Collectors.toList());
    }

    private int calculateConfidenceScore(long wordCount, int docCount) {
        if (docCount == 0 || wordCount == 0) return 0;

        int baseScore = 0;
        if (wordCount < 500) {
            baseScore = 15;
        } else if (wordCount < 2000) {
            baseScore = 35;
        } else if (wordCount < 10000) {
            baseScore = 65;
        } else if (wordCount < 50000) {
            baseScore = 85;
        } else {
            baseScore = 95;
        }

        // Add 5% for each document up to 30% additional bonus
        int docBonus = Math.min(30, docCount * 5);
        int finalScore = baseScore + docBonus;
        return Math.min(100, finalScore);
    }

    private BrainProfileDto mapToDto(BrainProfile profile, boolean upToDate) {
        long words = profile.getTotalWordsAnalyzed() != null ? profile.getTotalWordsAnalyzed() : 0L;
        int docs = profile.getDocumentCount() != null ? profile.getDocumentCount() : 0;
        int confidence = calculateConfidenceScore(words, docs);

        return BrainProfileDto.builder()
                .profileId(profile.getId())
                .workspaceId(profile.getWorkspace().getId())
                .creatorIdentity(profile.getCreatorIdentity())
                .creatorMission(profile.getCreatorMission())
                .creatorVision(profile.getCreatorVision())
                .audienceProfile(profile.getAudienceProfile())
                .communicationStyle(profile.getCommunicationStyle())
                .writingStyle(profile.getWritingStyle())
                .contentStyle(profile.getContentStyle())
                .preferredCTAStyle(profile.getPreferredCTAStyle())
                .niche(profile.getNiche())
                .strategicFocus(profile.getStrategicFocus())
                .personalityTraits(profile.getPersonalityTraits())
                .contentPillars(profile.getContentPillars())
                .expertiseAreas(profile.getExpertiseAreas())
                .longTermGoals(profile.getLongTermGoals())
                .extractedCreatorDNA(profile.getExtractedCreatorDNA())
                .contentExamples(profile.getContentExamples())
                .documentCount(docs)
                .totalWordsAnalyzed(words)
                .confidenceScore(confidence)
                .upToDate(upToDate)
                .createdAt(profile.getCreatedAt())
                .updatedAt(profile.getUpdatedAt())
                .build();
    }

    private BrainProfileSnapshotDto mapSnapshotToDto(BrainProfileSnapshot snapshot) {
        return BrainProfileSnapshotDto.builder()
                .snapshotId(snapshot.getId())
                .workspaceId(snapshot.getWorkspace().getId())
                .version(snapshot.getVersion())
                .creatorIdentity(snapshot.getCreatorIdentity())
                .audienceProfile(snapshot.getAudienceProfile())
                .communicationStyle(snapshot.getCommunicationStyle())
                .writingStyle(snapshot.getWritingStyle())
                .niche(snapshot.getNiche())
                .contentPillars(snapshot.getContentPillars())
                .longTermGoals(snapshot.getLongTermGoals())
                .extractedCreatorDNA(snapshot.getExtractedCreatorDNA())
                .createdAt(snapshot.getCreatedAt())
                .build();
    }
}
