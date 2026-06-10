package com.creatoros.api.controller;

import com.creatoros.api.dto.KnowledgeDocumentDto;
import com.creatoros.api.dto.KnowledgeDocumentResponse;
import com.creatoros.api.model.User;
import com.creatoros.api.service.KnowledgeDocumentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/knowledge")
@RequiredArgsConstructor
@CrossOrigin
public class KnowledgeDocumentController {

    private final KnowledgeDocumentService knowledgeDocumentService;

    @PostMapping
    public ResponseEntity<KnowledgeDocumentResponse> uploadDocument(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @RequestParam("file") MultipartFile file) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        try {
            KnowledgeDocumentResponse response = knowledgeDocumentService.uploadDocument(user, workspaceId, file);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (IllegalArgumentException e) {
            // Mapping IllegalArgumentException to badRequest/notFound
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping
    public ResponseEntity<List<KnowledgeDocumentDto>> listDocuments(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            List<KnowledgeDocumentDto> docs = knowledgeDocumentService.listDocuments(user, workspaceId);
            return ResponseEntity.ok(docs);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
    }

    @GetMapping("/{documentId}")
    public ResponseEntity<KnowledgeDocumentDto> getDocument(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @PathVariable UUID documentId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            KnowledgeDocumentDto doc = knowledgeDocumentService.getDocument(user, workspaceId, documentId);
            return ResponseEntity.ok(doc);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{documentId}")
    public ResponseEntity<Void> deleteDocument(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @PathVariable UUID documentId) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            knowledgeDocumentService.deleteDocument(user, workspaceId, documentId);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/search")
    public ResponseEntity<List<com.creatoros.api.dto.KnowledgeSearchResult.Match>> searchKnowledge(
            @AuthenticationPrincipal User user,
            @PathVariable UUID workspaceId,
            @RequestParam("query") String query) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            List<com.creatoros.api.dto.KnowledgeSearchResult.Match> results = 
                    knowledgeDocumentService.searchKnowledge(user, workspaceId, query);
            return ResponseEntity.ok(results);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
    }
}
