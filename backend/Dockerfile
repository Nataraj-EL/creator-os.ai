# Build Stage
FROM maven:3.9.6-eclipse-temurin-21-alpine AS build
WORKDIR /app

# Copy dependency definition
COPY pom.xml .

# Fetch dependencies (cached step unless pom.xml changes)
RUN mvn dependency:go-offline -B

# Copy source code and build
COPY src ./src
RUN mvn clean package -DskipTests

# Run Stage
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Copy executable jar from build stage
COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080

# Start Spring Boot application
ENTRYPOINT ["java", "-jar", "app.jar"]
