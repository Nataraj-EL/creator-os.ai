package com.creatoros.api.controller;

import com.creatoros.api.dto.CreatorProfileDto;
import com.creatoros.api.model.User;
import com.creatoros.api.service.CreatorProfileService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/profile")
@RequiredArgsConstructor
public class CreatorProfileController {

    private final CreatorProfileService creatorProfileService;

    @GetMapping
    public ResponseEntity<CreatorProfileDto> getProfile(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(creatorProfileService.getProfile(user, workspaceId));
    }

    @PutMapping
    public ResponseEntity<CreatorProfileDto> updateProfile(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @RequestBody CreatorProfileDto dto) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(creatorProfileService.updateProfile(user, workspaceId, dto));
    }
}
