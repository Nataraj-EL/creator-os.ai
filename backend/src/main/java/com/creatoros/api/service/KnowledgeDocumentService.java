package com.creatoros.api.service;

import com.creatoros.api.dto.KnowledgeDocumentDto;
import com.creatoros.api.dto.KnowledgeDocumentResponse;
import com.creatoros.api.dto.KnowledgeSearchInput;
import com.creatoros.api.dto.KnowledgeSearchResult;
import com.creatoros.api.model.*;
import com.creatoros.api.repository.KnowledgeDocumentRepository;
import com.creatoros.api.repository.WorkspaceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class KnowledgeDocumentService {

    private final KnowledgeDocumentRepository knowledgeDocumentRepository;
    private final WorkspaceRepository workspaceRepository;
    private final AiProviderRouter aiProviderRouter;

    @Transactional
    public KnowledgeDocumentResponse uploadDocument(User creator, UUID workspaceId, MultipartFile file) {
        Workspace workspace = workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || originalFilename.isEmpty()) {
            throw new IllegalArgumentException("File name is invalid");
        }

        String extension = "";
        int dotIndex = originalFilename.lastIndexOf('.');
        if (dotIndex > 0) {
            extension = originalFilename.substring(dotIndex).toLowerCase();
        }

        if (!extension.equals(".pdf") && !extension.equals(".docx") &&
            !extension.equals(".txt") && !extension.equals(".md")) {
            throw new IllegalArgumentException("Unsupported file type. Only PDF, DOCX, TXT, and MD are supported.");
        }

        // Save staged entity
        KnowledgeDocument doc = KnowledgeDocument.builder()
                .workspace(workspace)
                .fileName(originalFilename)
                .contentType(file.getContentType() != null ? file.getContentType() : "application/octet-stream")
                .fileSize(file.getSize())
                .status(KnowledgeStatus.PROCESSING)
                .deleted(false)
                .build();

        KnowledgeDocument saved = knowledgeDocumentRepository.save(doc);

        try {
            String text = "";
            if (extension.equals(".pdf")) {
                text = extractTextFromPdf(file.getBytes());
            } else if (extension.equals(".docx")) {
                text = extractTextFromDocx(file.getBytes());
            } else {
                text = new String(file.getBytes(), StandardCharsets.UTF_8);
            }

            int charCount = text.length();
            int wordCount = text.trim().isEmpty() ? 0 : text.trim().split("\\s+").length;

            saved.setExtractedText(text);
            saved.setCharacterCount(charCount);
            saved.setWordCount(wordCount);
            saved.setStatus(KnowledgeStatus.READY);
            saved.setUpdatedAt(Instant.now());
            knowledgeDocumentRepository.save(saved);

        } catch (Exception e) {
            saved.setStatus(KnowledgeStatus.FAILED);
            saved.setUpdatedAt(Instant.now());
            knowledgeDocumentRepository.save(saved);
            throw new RuntimeException("Content extraction failed: " + e.getMessage(), e);
        }

        return KnowledgeDocumentResponse.builder()
                .documentId(saved.getId())
                .status(saved.getStatus())
                .build();
    }

    @Transactional(readOnly = true)
    public List<KnowledgeDocumentDto> listDocuments(User creator, UUID workspaceId) {
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        return knowledgeDocumentRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId).stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public KnowledgeDocumentDto getDocument(User creator, UUID workspaceId, UUID documentId) {
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        KnowledgeDocument doc = knowledgeDocumentRepository.findByIdAndWorkspaceId(documentId, workspaceId)
                .orElseThrow(() -> new IllegalArgumentException("Document not found"));

        return mapToDto(doc);
    }

    @Transactional
    public void deleteDocument(User creator, UUID workspaceId, UUID documentId) {
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        KnowledgeDocument doc = knowledgeDocumentRepository.findByIdAndWorkspaceId(documentId, workspaceId)
                .orElseThrow(() -> new IllegalArgumentException("Document not found"));

        doc.setDeleted(true);
        doc.setUpdatedAt(Instant.now());
        knowledgeDocumentRepository.save(doc);
    }

    private String extractTextFromPdf(byte[] bytes) throws IOException {
        try (org.apache.pdfbox.pdmodel.PDDocument document = org.apache.pdfbox.Loader.loadPDF(bytes)) {
            org.apache.pdfbox.text.PDFTextStripper stripper = new org.apache.pdfbox.text.PDFTextStripper();
            return stripper.getText(document);
        }
    }

    private String extractTextFromDocx(byte[] bytes) throws IOException {
        try (java.io.ByteArrayInputStream bis = new java.io.ByteArrayInputStream(bytes);
             org.apache.poi.xwpf.usermodel.XWPFDocument doc = new org.apache.poi.xwpf.usermodel.XWPFDocument(bis)) {
            org.apache.poi.xwpf.extractor.XWPFWordExtractor extractor = new org.apache.poi.xwpf.extractor.XWPFWordExtractor(doc);
            return extractor.getText();
        }
    }

    private KnowledgeDocumentDto mapToDto(KnowledgeDocument doc) {
        return KnowledgeDocumentDto.builder()
                .documentId(doc.getId())
                .workspaceId(doc.getWorkspace().getId())
                .fileName(doc.getFileName())
                .contentType(doc.getContentType())
                .fileSize(doc.getFileSize())
                .extractedText(doc.getExtractedText())
                .wordCount(doc.getWordCount())
                .characterCount(doc.getCharacterCount())
                .status(doc.getStatus())
                .createdAt(doc.getCreatedAt())
                .updatedAt(doc.getUpdatedAt())
                .build();
    }

    @Transactional(readOnly = true)
    public List<KnowledgeSearchResult.Match> searchKnowledge(User creator, UUID workspaceId, String query) {
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        List<KnowledgeDocument> docs = knowledgeDocumentRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId);
        List<KnowledgeDocument> readyDocs = docs.stream()
                .filter(d -> d.getStatus() == KnowledgeStatus.READY && !d.isDeleted())
                .collect(Collectors.toList());

        if (readyDocs.isEmpty()) {
            return List.of();
        }

        // Perform Keyword Retrieval to obtain the Candidate Set
        String normalizedQuery = query != null ? query.toLowerCase().trim() : "";
        List<KnowledgeDocument> candidateDocs;
        if (normalizedQuery.isEmpty()) {
            candidateDocs = readyDocs;
        } else {
            String[] queryWords = normalizedQuery.split("\\s+");
            candidateDocs = readyDocs.stream()
                    .filter(d -> {
                        String fileName = d.getFileName() != null ? d.getFileName().toLowerCase() : "";
                        String text = d.getExtractedText() != null ? d.getExtractedText().toLowerCase() : "";
                        for (String word : queryWords) {
                            if (fileName.contains(word) || text.contains(word)) {
                                return true;
                            }
                        }
                        return false;
                    })
                    .collect(Collectors.toList());
        }

        if (candidateDocs.isEmpty()) {
            return List.of();
        }

        List<KnowledgeSearchInput.DocumentCandidate> candidates = candidateDocs.stream()
                .map(d -> KnowledgeSearchInput.DocumentCandidate.builder()
                        .documentId(d.getId())
                        .fileName(d.getFileName())
                        .content(d.getExtractedText())
                        .build())
                .collect(Collectors.toList());

        KnowledgeSearchInput searchInput = KnowledgeSearchInput.builder()
                .workspaceId(workspaceId)
                .query(query)
                .candidates(candidates)
                .build();

        KnowledgeSearchResult result = aiProviderRouter.executeWithFallback(
                AiTaskType.KNOWLEDGE_SEARCH,
                searchInput,
                KnowledgeSearchResult.class
        );

        return result.getMatches();
    }
}
