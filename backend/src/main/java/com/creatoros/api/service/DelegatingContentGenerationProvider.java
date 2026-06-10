package com.creatoros.api.service;

import com.creatoros.api.dto.ContentGenerationInput;
import com.creatoros.api.dto.GeneratedContent;
import com.creatoros.api.model.AiTaskType;
import com.creatoros.api.model.CreatorProfile;
import com.creatoros.api.model.BrainProfile;
import com.creatoros.api.repository.BrainProfileRepository;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@Primary
public class DelegatingContentGenerationProvider implements ContentGenerationProvider {

    private final AiProviderRouter aiProviderRouter;
    private final BrainProfileRepository brainProfileRepository;

    public DelegatingContentGenerationProvider(AiProviderRouter aiProviderRouter, BrainProfileRepository brainProfileRepository) {
        this.aiProviderRouter = aiProviderRouter;
        this.brainProfileRepository = brainProfileRepository;
    }

    @Override
    public GeneratedContent generateContent(CreatorProfile profile, String topic, String primaryGoal) {
        ContentGenerationInput.ContentGenerationInputBuilder builder = ContentGenerationInput.builder()
                .niche(profile != null ? profile.getNiche() : "general content creation")
                .voice(profile != null ? profile.getBrandVoice() : "engaging and informative")
                .platform(profile != null ? profile.getPrimaryPlatform() : "YouTube")
                .topic(topic)
                .primaryGoal(primaryGoal);

        if (profile != null && profile.getWorkspace() != null) {
            Optional<BrainProfile> brainOpt = brainProfileRepository.findByWorkspaceId(profile.getWorkspace().getId());
            if (brainOpt.isPresent()) {
                BrainProfile brain = brainOpt.get();
                builder.creatorIdentity(brain.getCreatorIdentity())
                        .audienceProfile(brain.getAudienceProfile())
                        .communicationStyle(brain.getCommunicationStyle())
                        .writingStyle(brain.getWritingStyle())
                        .preferredCTAStyle(brain.getPreferredCTAStyle())
                        .creatorDNA(brain.getExtractedCreatorDNA())
                        .contentExamples(brain.getContentExamples());
            }
        }

        return aiProviderRouter.executeWithFallback(
                AiTaskType.CONTENT_GENERATION,
                builder.build(),
                GeneratedContent.class
        );
    }
}

