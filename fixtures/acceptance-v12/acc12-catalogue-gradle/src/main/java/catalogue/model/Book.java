package catalogue.model;

public class Book {
  public final String heading;
  public final Author writer;
  public final int publishedYear;
  public Book nextOnShelf;

  public Book(String heading, Author writer, int publishedYear) {
    this.heading = heading;
    this.writer = writer;
    this.publishedYear = publishedYear;
    writer.titlesWritten = writer.titlesWritten + 1;
  }
}
