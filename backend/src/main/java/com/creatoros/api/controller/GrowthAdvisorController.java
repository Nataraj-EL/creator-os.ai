package com.creatoros.api.controller;

import com.creatoros.api.dto.GrowthAdvisorReportDto;
import com.creatoros.api.dto.GrowthAdvisorRequest;
import com.creatoros.api.model.User;
import com.creatoros.api.service.GrowthAdvisorService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/growth-advisor")
@RequiredArgsConstructor
@CrossOrigin
public class GrowthAdvisorController {

    private final GrowthAdvisorService growthAdvisorService;

    @PostMapping("/analyze")
    public ResponseEntity<GrowthAdvisorReportDto> analyzeProfile(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @Valid @RequestBody GrowthAdvisorRequest request) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        GrowthAdvisorReportDto result = growthAdvisorService.analyzeProfile(user, workspaceId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    @GetMapping
    public ResponseEntity<List<GrowthAdvisorReportDto>> listReports(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(growthAdvisorService.listReports(user, workspaceId));
    }

    @GetMapping("/{reportId}")
    public ResponseEntity<GrowthAdvisorReportDto> getReport(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @PathVariable UUID reportId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            GrowthAdvisorReportDto report = growthAdvisorService.getReport(user, workspaceId, reportId);
            return ResponseEntity.ok(report);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
