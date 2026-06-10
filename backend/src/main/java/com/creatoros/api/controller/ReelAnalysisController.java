package com.creatoros.api.controller;

import com.creatoros.api.dto.ReelAnalysisDto;
import com.creatoros.api.dto.ReelAnalysisResponse;
import com.creatoros.api.model.User;
import com.creatoros.api.service.ReelAnalyzerService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/reels")
@RequiredArgsConstructor
@CrossOrigin
public class ReelAnalysisController {

    private final ReelAnalyzerService reelAnalyzerService;

    @PostMapping("/analyze")
    public ResponseEntity<ReelAnalysisResponse> analyzeReel(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @RequestParam(value = "file", required = false) MultipartFile file,
            @RequestParam(value = "reelUrl", required = false) String reelUrl) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if ((file == null || file.isEmpty()) && (reelUrl == null || reelUrl.trim().isEmpty())) {
            return ResponseEntity.badRequest().build();
        }
        try {
            ReelAnalysisResponse response = reelAnalyzerService.analyzeReel(user, workspaceId, file, reelUrl);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping
    public ResponseEntity<List<ReelAnalysisDto>> listAnalyses(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        List<ReelAnalysisDto> history = reelAnalyzerService.listAnalyses(user, workspaceId);
        return ResponseEntity.ok(history);
    }

    @GetMapping("/{analysisId}")
    public ResponseEntity<ReelAnalysisDto> getAnalysis(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @PathVariable UUID analysisId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            ReelAnalysisDto analysis = reelAnalyzerService.getAnalysis(user, workspaceId, analysisId);
            return ResponseEntity.ok(analysis);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{analysisId}")
    public ResponseEntity<Void> deleteAnalysis(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @PathVariable UUID analysisId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            reelAnalyzerService.deleteAnalysis(user, workspaceId, analysisId);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
