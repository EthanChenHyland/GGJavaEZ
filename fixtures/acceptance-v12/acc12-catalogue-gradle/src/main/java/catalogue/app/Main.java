package catalogue.app;

import catalogue.model.Author;
import catalogue.model.Book;
import catalogue.search.TitleSearch;

public class Main {
  public static void main(String[] args) {
    Catalogue shelf = Catalogue.INSTANCE;
    Author hart = new Author("Juno Hart");
    shelf.register(new Book("Winter Tides", hart, 1998));
    shelf.register(new Book("Glass Harbour", hart, 2004));
    shelf.register(new Book("Quiet Engines", new Author("Ode Lin"), 2011));
    TitleSearch search = new TitleSearch(shelf.repository());
    Book found = search.firstContaining("Harbour");
    System.out.println("FOUND " + found.publishedYear);
    System.out.println("COUNT " + shelf.repository().storedCount());
    System.out.println("REGISTRATIONS " + Catalogue.registrations);
  }
}
