package com.creatoros.api.service;

import com.creatoros.api.dto.ContentRepurposeInput;
import com.creatoros.api.dto.ContentRepurposeRequest;
import com.creatoros.api.dto.ContentRepurposeResult;
import com.creatoros.api.model.AiTaskType;
import com.creatoros.api.model.User;
import com.creatoros.api.model.Workspace;
import com.creatoros.api.repository.WorkspaceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ContentRepurposeService {

    private final WorkspaceRepository workspaceRepository;
    private final AiProviderRouter aiProviderRouter;

    public ContentRepurposeResult repurposeContent(User creator, UUID workspaceId, ContentRepurposeRequest request) {
        // Validate workspace ownership / membership
        Workspace workspace = workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        // Build input for provider router
        ContentRepurposeInput input = ContentRepurposeInput.builder()
                .originalContent(request.getOriginalContent())
                .sourceType(request.getSourceType())
                .targetFormat(request.getTargetFormat())
                .build();

        // Run fallback routing chain
        return aiProviderRouter.executeWithFallback(
                AiTaskType.CONTENT_REPURPOSE,
                input,
                ContentRepurposeResult.class
        );
    }
}
