import java.util.ArrayList;
import java.util.HashMap;

public final class Graph {
    public final Node[] nodes;
    public final HashMap<String, Node> byName;
    public final ArrayList<Node> ordered;

    public Graph(Node[] nodes, HashMap<String, Node> byName, ArrayList<Node> ordered) {
        this.nodes = nodes;
        this.byName = byName;
        this.ordered = ordered;
    }
}
