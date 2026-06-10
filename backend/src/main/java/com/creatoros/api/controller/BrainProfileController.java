package com.creatoros.api.controller;

import com.creatoros.api.dto.BrainProfileDto;
import com.creatoros.api.dto.BrainProfileSnapshotDto;
import com.creatoros.api.model.User;
import com.creatoros.api.service.BrainProfileService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/brain")
@RequiredArgsConstructor
@CrossOrigin
public class BrainProfileController {

    private final BrainProfileService brainProfileService;

    @GetMapping
    public ResponseEntity<BrainProfileDto> getBrainProfile(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            BrainProfileDto profile = brainProfileService.getProfile(user, workspaceId);
            return ResponseEntity.ok(profile);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
    }

    @PostMapping("/rebuild")
    public ResponseEntity<BrainProfileDto> rebuildBrain(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            BrainProfileDto updatedProfile = brainProfileService.analyzeWorkspaceKnowledge(user, workspaceId);
            return ResponseEntity.ok(updatedProfile);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(null);
        }
    }

    @GetMapping("/snapshots")
    public ResponseEntity<List<BrainProfileSnapshotDto>> getSnapshots(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            List<BrainProfileSnapshotDto> snapshots = brainProfileService.getSnapshots(user, workspaceId);
            return ResponseEntity.ok(snapshots);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
    }
}
