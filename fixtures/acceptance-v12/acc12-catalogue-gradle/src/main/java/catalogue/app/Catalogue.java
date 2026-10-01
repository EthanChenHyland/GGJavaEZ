package catalogue.app;

import catalogue.model.Book;
import catalogue.repo.ShelfRepository;

public final class Catalogue {
  public static final Catalogue INSTANCE = new Catalogue();
  static int registrations;

  private final ShelfRepository books = new ShelfRepository();

  private Catalogue() {
  }

  void register(Book book) {
    books.store(book);
    registrations = registrations + 1;
  }

  ShelfRepository repository() {
    return books;
  }
}
