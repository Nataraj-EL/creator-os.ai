package com.creatoros.api.service;

import com.creatoros.api.dto.CreatorProfileDto;
import com.creatoros.api.model.CreatorProfile;
import com.creatoros.api.model.User;
import com.creatoros.api.model.Workspace;
import com.creatoros.api.repository.CreatorProfileRepository;
import com.creatoros.api.repository.WorkspaceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CreatorProfileService {

    private final CreatorProfileRepository creatorProfileRepository;
    private final WorkspaceRepository workspaceRepository;

    @Transactional(readOnly = true)
    public CreatorProfileDto getProfile(User creator, UUID workspaceId) {
        Workspace workspace = workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        CreatorProfile profile = creatorProfileRepository.findById(workspaceId)
                .orElseGet(() -> {
                    CreatorProfile newProfile = CreatorProfile.builder()
                            .workspace(workspace)
                            .workspaceId(workspaceId)
                            .creatorName("")
                            .niche("")
                            .primaryPlatform("")
                            .targetAudience("")
                            .contentStyle("")
                            .brandVoice("")
                            .growthGoal("")
                            .postingFrequency("")
                            .build();
                    return creatorProfileRepository.save(newProfile);
                });

        return mapToDto(profile);
    }

    @Transactional
    public CreatorProfileDto updateProfile(User creator, UUID workspaceId, CreatorProfileDto dto) {
        Workspace workspace = workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        CreatorProfile profile = creatorProfileRepository.findById(workspaceId)
                .orElseGet(() -> CreatorProfile.builder()
                        .workspace(workspace)
                        .workspaceId(workspaceId)
                        .build());

        profile.setCreatorName(dto.getCreatorName());
        profile.setNiche(dto.getNiche());
        profile.setPrimaryPlatform(dto.getPrimaryPlatform());
        profile.setTargetAudience(dto.getTargetAudience());
        profile.setContentStyle(dto.getContentStyle());
        profile.setBrandVoice(dto.getBrandVoice());
        profile.setGrowthGoal(dto.getGrowthGoal());
        profile.setPostingFrequency(dto.getPostingFrequency());

        CreatorProfile updatedProfile = creatorProfileRepository.save(profile);
        return mapToDto(updatedProfile);
    }

    private CreatorProfileDto mapToDto(CreatorProfile profile) {
        return CreatorProfileDto.builder()
                .workspaceId(profile.getWorkspaceId())
                .creatorName(profile.getCreatorName())
                .niche(profile.getNiche())
                .primaryPlatform(profile.getPrimaryPlatform())
                .targetAudience(profile.getTargetAudience())
                .contentStyle(profile.getContentStyle())
                .brandVoice(profile.getBrandVoice())
                .growthGoal(profile.getGrowthGoal())
                .postingFrequency(profile.getPostingFrequency())
                .build();
    }
}
