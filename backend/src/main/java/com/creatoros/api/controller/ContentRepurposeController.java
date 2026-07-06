package com.creatoros.api.controller;

import com.creatoros.api.dto.ContentRepurposeRequest;
import com.creatoros.api.dto.ContentRepurposeResult;
import com.creatoros.api.model.User;
import com.creatoros.api.service.ContentRepurposeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/repurpose")
@RequiredArgsConstructor
@CrossOrigin
public class ContentRepurposeController {

    private final ContentRepurposeService contentRepurposeService;

    @PostMapping
    public ResponseEntity<ContentRepurposeResult> repurposeContent(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @Valid @RequestBody ContentRepurposeRequest request) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        ContentRepurposeResult result = contentRepurposeService.repurposeContent(user, workspaceId, request);
        return ResponseEntity.ok(result);
    }
}
