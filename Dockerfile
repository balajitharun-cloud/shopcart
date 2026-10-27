# Build:  docker build -t shopcart .
# Run:    docker run -p 8080:8080 -e APP_CORS_ALLOWED_ORIGINS=https://you.github.io shopcart
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /src/target/shopcart-1.0.0.jar app.jar
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
