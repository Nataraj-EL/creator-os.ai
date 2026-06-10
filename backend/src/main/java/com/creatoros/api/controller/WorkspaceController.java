package com.creatoros.api.controller;

import com.creatoros.api.dto.WorkspaceDto;
import com.creatoros.api.dto.WorkspaceRequest;
import com.creatoros.api.model.User;
import com.creatoros.api.service.WorkspaceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces")
@RequiredArgsConstructor
public class WorkspaceController {

    private final WorkspaceService workspaceService;

    @GetMapping
    public ResponseEntity<List<WorkspaceDto>> getWorkspaces(@AuthenticationPrincipal User user) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(workspaceService.listWorkspaces(user));
    }

    @PostMapping
    public ResponseEntity<WorkspaceDto> createWorkspace(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody WorkspaceRequest request) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(workspaceService.createWorkspace(user, request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<WorkspaceDto> updateWorkspace(
            @AuthenticationPrincipal User user,
            @PathVariable UUID id,
            @Valid @RequestBody WorkspaceRequest request) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(workspaceService.updateWorkspace(user, id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteWorkspace(
            @AuthenticationPrincipal User user,
            @PathVariable UUID id) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        workspaceService.softDeleteWorkspace(user, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/activate")
    public ResponseEntity<WorkspaceDto> activateWorkspace(
            @AuthenticationPrincipal User user,
            @PathVariable UUID id) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(workspaceService.activateWorkspace(user, id));
    }
}
