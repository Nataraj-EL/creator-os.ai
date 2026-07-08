package com.creatoros.api.security;

import com.creatoros.api.model.User;
import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class JwtTokenProvider {

    private final SecretKey key;
    private final long jwtExpirationInMs;
    private final long refreshExpirationInMs;

    public JwtTokenProvider(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.expiration}") long jwtExpirationInMs,
            @Value("${jwt.refreshExpiration}") long refreshExpirationInMs) {
        this.key = Keys.hmacShaKeyFor(Decoders.BASE64.decode(secret));
        this.jwtExpirationInMs = jwtExpirationInMs;
        this.refreshExpirationInMs = refreshExpirationInMs;
    }

    public String generateAccessToken(User user) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("id", user.getId().toString());
        claims.put("role", user.getRole().name());
        claims.put("email", user.getEmail());
        
        Instant now = Instant.now();
        Instant expiryDate = now.plusMillis(jwtExpirationInMs);

        return Jwts.builder()
                .claims(claims)
                .subject(user.getEmail())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiryDate))
                .signWith(key)
                .compact();
    }

    public String generateRefreshToken() {
        return UUID.randomUUID().toString();
    }

    public String getUsernameFromToken(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return claims.getSubject();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
    
    public long getRefreshExpirationInMs() {
        return refreshExpirationInMs;
    }
}
