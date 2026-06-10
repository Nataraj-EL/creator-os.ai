package com.creatoros.api.controller;

import com.creatoros.api.dto.GrowthAuditDto;
import com.creatoros.api.model.User;
import com.creatoros.api.service.GrowthAuditService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/audits")
@RequiredArgsConstructor
public class GrowthAuditController {

    private final GrowthAuditService growthAuditService;

    @PostMapping
    public ResponseEntity<GrowthAuditDto> runAudit(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(growthAuditService.runAudit(user, workspaceId));
    }

    @GetMapping
    public ResponseEntity<List<GrowthAuditDto>> getAuditHistory(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(growthAuditService.getAuditHistory(user, workspaceId));
    }

    @GetMapping("/latest")
    public ResponseEntity<GrowthAuditDto> getLatestAudit(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return growthAuditService.getLatestAudit(user, workspaceId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PatchMapping("/recommendations/{recommendationId}")
    public ResponseEntity<Void> patchRecommendationStatus(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @PathVariable UUID recommendationId,
            @RequestBody Map<String, String> body) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        String status = body.get("status");
        if (status == null) {
            return ResponseEntity.badRequest().build();
        }
        growthAuditService.patchRecommendationStatus(user, workspaceId, recommendationId, status);
        return ResponseEntity.ok().build();
    }
}
