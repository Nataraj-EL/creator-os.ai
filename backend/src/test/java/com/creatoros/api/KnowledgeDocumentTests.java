package com.creatoros.api;

import com.creatoros.api.dto.KnowledgeDocumentDto;
import com.creatoros.api.dto.KnowledgeDocumentResponse;
import com.creatoros.api.dto.RegisterRequest;
import com.creatoros.api.model.KnowledgeStatus;
import com.creatoros.api.model.User;
import com.creatoros.api.model.Workspace;
import com.creatoros.api.repository.UserRepository;
import com.creatoros.api.service.KnowledgeDocumentService;
import com.creatoros.api.service.UserService;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
public class KnowledgeDocumentTests {

    @Autowired
    private UserService userService;

    @Autowired
    private KnowledgeDocumentService knowledgeDocumentService;

    @Autowired
    private UserRepository userRepository;

    private User testUser1;
    private Workspace testWorkspace1;

    private User testUser2;
    private Workspace testWorkspace2;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();

        // Register User 1
        RegisterRequest registerRequest1 = new RegisterRequest();
        registerRequest1.setEmail("user1@creatoros.ai");
        registerRequest1.setPassword("Password123!");
        registerRequest1.setWorkspaceName("User 1 Workspace");

        userService.register(registerRequest1);
        testUser1 = userRepository.findByEmail("user1@creatoros.ai").orElseThrow();
        testWorkspace1 = testUser1.getActiveWorkspace();

        // Register User 2
        RegisterRequest registerRequest2 = new RegisterRequest();
        registerRequest2.setEmail("user2@creatoros.ai");
        registerRequest2.setPassword("Password123!");
        registerRequest2.setWorkspaceName("User 2 Workspace");

        userService.register(registerRequest2);
        testUser2 = userRepository.findByEmail("user2@creatoros.ai").orElseThrow();
        testWorkspace2 = testUser2.getActiveWorkspace();
    }

    @Test
    void testTxtExtractionSucceeds() throws Exception {
        String content = "Hello world TXT test content. It has multiple words.";
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "sample.txt",
                "text/plain",
                content.getBytes(StandardCharsets.UTF_8)
        );

        KnowledgeDocumentResponse response = knowledgeDocumentService.uploadDocument(testUser1, testWorkspace1.getId(), file);
        assertNotNull(response);
        assertEquals(KnowledgeStatus.READY, response.getStatus());

        KnowledgeDocumentDto details = knowledgeDocumentService.getDocument(testUser1, testWorkspace1.getId(), response.getDocumentId());
        assertEquals(content, details.getExtractedText());
        assertEquals(content.length(), details.getCharacterCount());
        assertEquals(9, details.getWordCount());
    }

    @Test
    void testMdExtractionSucceeds() throws Exception {
        String content = "# Header\nHello world MD test content.";
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "readme.md",
                "text/markdown",
                content.getBytes(StandardCharsets.UTF_8)
        );

        KnowledgeDocumentResponse response = knowledgeDocumentService.uploadDocument(testUser1, testWorkspace1.getId(), file);
        assertNotNull(response);
        assertEquals(KnowledgeStatus.READY, response.getStatus());

        KnowledgeDocumentDto details = knowledgeDocumentService.getDocument(testUser1, testWorkspace1.getId(), response.getDocumentId());
        assertEquals(content, details.getExtractedText());
        assertEquals(content.length(), details.getCharacterCount());
        assertEquals(7, details.getWordCount());
    }

    @Test
    void testPdfExtractionSucceeds() throws Exception {
        byte[] pdfBytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            try (PDPageContentStream pcs = new PDPageContentStream(doc, page)) {
                pcs.beginText();
                pcs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                pcs.newLineAtOffset(50, 700);
                pcs.showText("Hello world PDF test content");
                pcs.endText();
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            pdfBytes = baos.toByteArray();
        }

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "document.pdf",
                "application/pdf",
                pdfBytes
        );

        KnowledgeDocumentResponse response = knowledgeDocumentService.uploadDocument(testUser1, testWorkspace1.getId(), file);
        assertNotNull(response);
        assertEquals(KnowledgeStatus.READY, response.getStatus());

        KnowledgeDocumentDto details = knowledgeDocumentService.getDocument(testUser1, testWorkspace1.getId(), response.getDocumentId());
        assertTrue(details.getExtractedText().contains("Hello world PDF test content"));
        assertTrue(details.getCharacterCount() > 0);
        assertTrue(details.getWordCount() > 0);
    }

    @Test
    void testDocxExtractionSucceeds() throws Exception {
        byte[] docxBytes;
        try (XWPFDocument doc = new XWPFDocument()) {
            XWPFParagraph p = doc.createParagraph();
            XWPFRun r = p.createRun();
            r.setText("Hello world DOCX test content");
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.write(baos);
            docxBytes = baos.toByteArray();
        }

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "document.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                docxBytes
        );

        KnowledgeDocumentResponse response = knowledgeDocumentService.uploadDocument(testUser1, testWorkspace1.getId(), file);
        assertNotNull(response);
        assertEquals(KnowledgeStatus.READY, response.getStatus());

        KnowledgeDocumentDto details = knowledgeDocumentService.getDocument(testUser1, testWorkspace1.getId(), response.getDocumentId());
        assertTrue(details.getExtractedText().contains("Hello world DOCX test content"));
        assertTrue(details.getCharacterCount() > 0);
        assertTrue(details.getWordCount() > 0);
    }

    @Test
    void testUnsupportedFileTypeThrows() {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "unsupported.jpg",
                "image/jpeg",
                new byte[]{1, 2, 3}
        );

        assertThrows(IllegalArgumentException.class, () ->
            knowledgeDocumentService.uploadDocument(testUser1, testWorkspace1.getId(), file)
        );
    }

    @Test
    void testWorkspaceIsolationAndAuthBoundaries() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "isolated.txt",
                "text/plain",
                "secret data".getBytes(StandardCharsets.UTF_8)
        );

        KnowledgeDocumentResponse response = knowledgeDocumentService.uploadDocument(testUser1, testWorkspace1.getId(), file);

        // User 2 tries to access User 1's document in User 1's workspace -> fails
        assertThrows(IllegalArgumentException.class, () ->
            knowledgeDocumentService.getDocument(testUser2, testWorkspace1.getId(), response.getDocumentId())
        );

        // User 1 tries to access using User 2's workspace ID -> fails
        assertThrows(IllegalArgumentException.class, () ->
            knowledgeDocumentService.getDocument(testUser1, testWorkspace2.getId(), response.getDocumentId())
        );

        // User 2 lists User 1's workspace -> fails
        assertThrows(IllegalArgumentException.class, () ->
            knowledgeDocumentService.listDocuments(testUser2, testWorkspace1.getId())
        );

        // User 2 deletes User 1's document -> fails
        assertThrows(IllegalArgumentException.class, () ->
            knowledgeDocumentService.deleteDocument(testUser2, testWorkspace1.getId(), response.getDocumentId())
        );
    }

    @Test
    void testSoftDelete() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "todelete.txt",
                "text/plain",
                "data to delete".getBytes(StandardCharsets.UTF_8)
        );

        KnowledgeDocumentResponse response = knowledgeDocumentService.uploadDocument(testUser1, testWorkspace1.getId(), file);

        // Verify list returns 1
        List<KnowledgeDocumentDto> docs = knowledgeDocumentService.listDocuments(testUser1, testWorkspace1.getId());
        assertEquals(1, docs.size());

        // Delete
        knowledgeDocumentService.deleteDocument(testUser1, testWorkspace1.getId(), response.getDocumentId());

        // Verify list is empty
        docs = knowledgeDocumentService.listDocuments(testUser1, testWorkspace1.getId());
        assertTrue(docs.isEmpty());

        // Verify fetch single throws
        assertThrows(IllegalArgumentException.class, () ->
            knowledgeDocumentService.getDocument(testUser1, testWorkspace1.getId(), response.getDocumentId())
        );
    }
}
