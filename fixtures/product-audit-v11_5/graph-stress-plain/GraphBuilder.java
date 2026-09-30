import java.util.ArrayList;
import java.util.HashMap;

public final class GraphBuilder {
    public Graph build(int size) {
        Node[] nodes = new Node[size];
        HashMap<String, Node> byName = new HashMap<>();
        ArrayList<Node> ordered = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            Node node = new Node(i);
            nodes[i] = node;
            byName.put("node-" + i, node);
            ordered.add(node);
        }
        for (int i = 0; i < size; i++) {
            nodes[i].next = nodes[(i + 1) % size];
            nodes[i].skip = nodes[(i + 7) % size];
        }
        return new Graph(nodes, byName, ordered);
    }
}
