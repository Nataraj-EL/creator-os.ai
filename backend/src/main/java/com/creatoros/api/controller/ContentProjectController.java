package com.creatoros.api.controller;

import com.creatoros.api.dto.ContentProjectDto;
import com.creatoros.api.dto.CreateContentProjectRequest;
import com.creatoros.api.dto.UpdateContentProjectRequest;
import com.creatoros.api.model.User;
import com.creatoros.api.service.ContentProjectService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/content")
@RequiredArgsConstructor
@CrossOrigin
public class ContentProjectController {

    private final ContentProjectService contentProjectService;

    @PostMapping
    public ResponseEntity<ContentProjectDto> createProject(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @Valid @RequestBody CreateContentProjectRequest request) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        ContentProjectDto created = contentProjectService.createProject(user, workspaceId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping
    public ResponseEntity<List<ContentProjectDto>> listProjects(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        List<ContentProjectDto> projects = contentProjectService.listProjects(user, workspaceId);
        return ResponseEntity.ok(projects);
    }

    @GetMapping("/{projectId}")
    public ResponseEntity<ContentProjectDto> getProject(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @PathVariable UUID projectId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            ContentProjectDto project = contentProjectService.getProject(user, workspaceId, projectId);
            return ResponseEntity.ok(project);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/{projectId}")
    public ResponseEntity<ContentProjectDto> updateProject(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @PathVariable UUID projectId,
            @RequestBody UpdateContentProjectRequest request) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            ContentProjectDto updated = contentProjectService.updateProject(user, workspaceId, projectId, request);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{projectId}")
    public ResponseEntity<Void> deleteProject(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @PathVariable UUID projectId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            contentProjectService.deleteProject(user, workspaceId, projectId);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{projectId}/duplicate")
    public ResponseEntity<ContentProjectDto> duplicateProject(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @PathVariable UUID projectId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            ContentProjectDto clone = contentProjectService.duplicateProject(user, workspaceId, projectId);
            return ResponseEntity.status(HttpStatus.CREATED).body(clone);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{projectId}/regenerate")
    public ResponseEntity<ContentProjectDto> regenerateContent(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @PathVariable UUID projectId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            ContentProjectDto regenerated = contentProjectService.regenerateContent(user, workspaceId, projectId);
            return ResponseEntity.ok(regenerated);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
