package com.creatoros.api.service;

import com.creatoros.api.dto.*;
import com.creatoros.api.model.*;
import com.creatoros.api.repository.ContentProjectRepository;
import com.creatoros.api.repository.WorkspaceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ContentProjectService {

    private final ContentProjectRepository contentProjectRepository;
    private final WorkspaceRepository workspaceRepository;
    private final ContentGenerationProvider contentGenerationProvider;

    @Transactional(readOnly = true)
    public List<ContentProjectDto> listProjects(User creator, UUID workspaceId) {
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        return contentProjectRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId).stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ContentProjectDto getProject(User creator, UUID workspaceId, UUID projectId) {
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        ContentProject project = contentProjectRepository.findByIdAndWorkspaceId(projectId, workspaceId)
                .orElseThrow(() -> new IllegalArgumentException("Project not found"));

        return mapToDto(project);
    }

    @Transactional
    public ContentProjectDto createProject(User creator, UUID workspaceId, CreateContentProjectRequest request) {
        Workspace workspace = workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        CreatorProfile profile = workspace.getCreatorProfile();
        GeneratedContent generated = contentGenerationProvider.generateContent(profile, request.getTopic(), request.getPrimaryGoal());

        ContentProject project = ContentProject.builder()
                .workspace(workspace)
                .title(request.getTitle())
                .topic(request.getTopic())
                .primaryGoal(request.getPrimaryGoal())
                .hook(generated.getHooks().isEmpty() ? "" : generated.getHooks().get(0))
                .script(generated.getScript())
                .cta(generated.getCtas().isEmpty() ? "" : generated.getCtas().get(0))
                .status("DRAFT")
                .build();

        // Save variants in normalized table
        List<ContentVariant> variants = new ArrayList<>();
        for (String hook : generated.getHooks()) {
            variants.add(ContentVariant.builder().project(project).variantType("HOOK").content(hook).build());
        }
        for (String cta : generated.getCtas()) {
            variants.add(ContentVariant.builder().project(project).variantType("CTA").content(cta).build());
        }
        project.setVariants(variants);

        ContentProject savedProject = contentProjectRepository.save(project);
        return mapToDto(savedProject);
    }

    @Transactional
    public ContentProjectDto updateProject(User creator, UUID workspaceId, UUID projectId, UpdateContentProjectRequest request) {
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        ContentProject project = contentProjectRepository.findByIdAndWorkspaceId(projectId, workspaceId)
                .orElseThrow(() -> new IllegalArgumentException("Project not found"));

        if (request.getTitle() != null) project.setTitle(request.getTitle());
        if (request.getPrimaryGoal() != null) project.setPrimaryGoal(request.getPrimaryGoal());
        if (request.getHook() != null) project.setHook(request.getHook());
        if (request.getScript() != null) project.setScript(request.getScript());
        if (request.getCta() != null) project.setCta(request.getCta());
        if (request.getStatus() != null) project.setStatus(request.getStatus());

        ContentProject updated = contentProjectRepository.save(project);
        return mapToDto(updated);
    }

    @Transactional
    public void deleteProject(User creator, UUID workspaceId, UUID projectId) {
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        ContentProject project = contentProjectRepository.findByIdAndWorkspaceId(projectId, workspaceId)
                .orElseThrow(() -> new IllegalArgumentException("Project not found"));

        project.setDeleted(true);
        contentProjectRepository.save(project);
    }

    @Transactional
    public ContentProjectDto duplicateProject(User creator, UUID workspaceId, UUID projectId) {
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        ContentProject original = contentProjectRepository.findByIdAndWorkspaceId(projectId, workspaceId)
                .orElseThrow(() -> new IllegalArgumentException("Project not found"));

        ContentProject clone = ContentProject.builder()
                .workspace(original.getWorkspace())
                .title(original.getTitle() + " - Copy")
                .topic(original.getTopic())
                .primaryGoal(original.getPrimaryGoal())
                .hook(original.getHook())
                .script(original.getScript())
                .cta(original.getCta())
                .status("DRAFT")
                .build();

        List<ContentVariant> clonedVariants = original.getVariants().stream()
                .map(v -> ContentVariant.builder()
                        .project(clone)
                        .variantType(v.getVariantType())
                        .content(v.getContent())
                        .build())
                .collect(Collectors.toList());

        clone.setVariants(clonedVariants);

        ContentProject savedClone = contentProjectRepository.save(clone);
        return mapToDto(savedClone);
    }

    @Transactional
    public ContentProjectDto regenerateContent(User creator, UUID workspaceId, UUID projectId) {
        Workspace workspace = workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        ContentProject project = contentProjectRepository.findByIdAndWorkspaceId(projectId, workspaceId)
                .orElseThrow(() -> new IllegalArgumentException("Project not found"));

        CreatorProfile profile = workspace.getCreatorProfile();
        
        // Add random seed variation to allow actual regeneration of text
        String regeneratedTopic = project.getTopic() + " " + UUID.randomUUID().toString().substring(0, 4);
        GeneratedContent generated = contentGenerationProvider.generateContent(profile, regeneratedTopic, project.getPrimaryGoal());

        project.setHook(generated.getHooks().isEmpty() ? "" : generated.getHooks().get(0));
        project.setScript(generated.getScript());
        project.setCta(generated.getCtas().isEmpty() ? "" : generated.getCtas().get(0));

        // Overwrite variants
        project.getVariants().clear();
        for (String hook : generated.getHooks()) {
            project.getVariants().add(ContentVariant.builder().project(project).variantType("HOOK").content(hook).build());
        }
        for (String cta : generated.getCtas()) {
            project.getVariants().add(ContentVariant.builder().project(project).variantType("CTA").content(cta).build());
        }

        ContentProject updated = contentProjectRepository.save(project);
        return mapToDto(updated);
    }

    private ContentProjectDto mapToDto(ContentProject p) {
        List<ContentVariantDto> variants = p.getVariants().stream()
                .map(v -> ContentVariantDto.builder()
                        .id(v.getId())
                        .variantType(v.getVariantType())
                        .content(v.getContent())
                        .build())
                .collect(Collectors.toList());

        return ContentProjectDto.builder()
                .projectId(p.getId())
                .workspaceId(p.getWorkspace().getId())
                .title(p.getTitle())
                .topic(p.getTopic())
                .primaryGoal(p.getPrimaryGoal())
                .hook(p.getHook())
                .script(p.getScript())
                .cta(p.getCta())
                .status(p.getStatus())
                .variants(variants)
                .createdAt(p.getCreatedAt())
                .updatedAt(p.getUpdatedAt())
                .build();
    }
}
